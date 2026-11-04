package verify

// Shared primitives for every provider verifier/signer. Everything here is
// pure (no net, no disk) and deterministic. These are unexported helpers; they
// do not touch the stable public surface defined in verify.go.

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

const (
	algoSHA256 = "HMAC-SHA256"
	algoSHA1   = "HMAC-SHA1"
	encHex     = "hex"
	encBase64  = "base64"

	// defaultTolerance is the replay window used by timestamped schemes
	// (Stripe, Slack, Standard Webhooks all default to 5 minutes).
	defaultTolerance = 300
)

// ---- HMAC + encoding -------------------------------------------------------

func hmac256(key, msg []byte) []byte {
	m := hmac.New(sha256.New, key)
	m.Write(msg)
	return m.Sum(nil)
}

func hmac1(key, msg []byte) []byte {
	m := hmac.New(sha1.New, key)
	m.Write(msg)
	return m.Sum(nil)
}

func hexEnc(b []byte) string { return hex.EncodeToString(b) }
func b64Enc(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

// encode renders a raw digest in the scheme's canonical encoding.
func encode(enc string, raw []byte) string {
	if enc == encBase64 {
		return b64Enc(raw)
	}
	return hexEnc(raw)
}

// encodeOther renders a raw digest in the *opposite* encoding — used to detect
// the classic hex-vs-base64 mix-up (Shopify is base64; Stripe/Razorpay are hex).
func encodeOther(enc string, raw []byte) string {
	if enc == encBase64 {
		return hexEnc(raw)
	}
	return b64Enc(raw)
}

// ---- constant-time comparison ---------------------------------------------

// ctEqualStr compares two strings in constant time.
func ctEqualStr(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// ctAny reports whether want equals any candidate. It scans every candidate
// (no short-circuit) so timing does not reveal which, or how many, matched.
func ctAny(want string, candidates []string) bool {
	matched := 0
	for _, c := range candidates {
		if ctEqualStr(c, want) {
			matched = 1
		}
	}
	return matched == 1
}

// ---- small formatting helpers ---------------------------------------------

// clip trims a digest/secret to a short, log-safe prefix for the Details pane.
func clip(s string) string {
	const n = 12
	if len(s) > n {
		return s[:n] + "…"
	}
	return s
}

// secretHint returns a redacted, recognizable fragment of the secret for the
// human summary (e.g. "whsec_…"), never the secret itself.
func secretHint(secret string) string {
	if secret == "" {
		return ""
	}
	if i := strings.IndexByte(secret, '_'); i > 0 && i < 10 {
		return secret[:i+1] + "…" // keep the "whsec_" / prefix, hide the rest
	}
	if len(secret) <= 4 {
		return "…"
	}
	return secret[:2] + "…"
}

// signError is returned by signers when they cannot produce headers.
type signError string

func (e signError) Error() string { return string(e) }

func errNoSecret(p Provider) error {
	return signError("no signing secret provided for provider " + string(p))
}

func result(p Provider, st Status, c Cause, summary string, d map[string]string) Result {
	if d == nil {
		d = map[string]string{}
	}
	return Result{Provider: p, Status: st, Cause: c, Summary: summary, Details: d}
}

// ---- timestamp helpers -----------------------------------------------------

func parseUnix(s string) (int64, bool) {
	n, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}

// skewSeconds returns the absolute distance in seconds between now and a signed
// unix timestamp.
func skewSeconds(now time.Time, t int64) int64 {
	d := now.Unix() - t
	if d < 0 {
		return -d
	}
	return d
}

func toleranceOf(in Input) int {
	if in.ToleranceSeconds > 0 {
		return in.ToleranceSeconds
	}
	return defaultTolerance
}

// ---- smart-hint classification --------------------------------------------

// classifyHMAC compares a computed raw digest against the provided signature and
// returns the precise cause plus structured details. It implements the two
// teaching hints:
//
//   - encoding_mismatch: the provided value equals the *other* encoding of the
//     exact same digest (hex where base64 was expected, or vice versa).
//   - body_possibly_altered: verification fails, but the body re-serialized
//     through a JSON round-trip (which differs from the received bytes) *would*
//     verify — the fingerprint of a body-parsing middleware that mutated the
//     payload before it reached us. This is the #1 real-world failure cause.
//
// altered recomputes the match against candidate (re-encoded) body bytes.
func classifyHMAC(raw []byte, provided, enc string, body []byte, altered func(b []byte) bool) (Cause, map[string]string) {
	want := encode(enc, raw)
	d := map[string]string{
		"encoding": enc,
		"computed": clip(want),
		"provided": clip(provided),
	}
	if ctEqualStr(provided, want) {
		return CauseOK, d
	}
	if other := encodeOther(enc, raw); ctEqualStr(provided, other) {
		d["computed_other_encoding"] = clip(other)
		return CauseEncodingMismatch, d
	}
	if re, ok := bodyAltered(body, altered); ok {
		d["received_body_len"] = strconv.Itoa(len(body))
		d["reencoded_body_len"] = strconv.Itoa(len(re))
		return CauseBodyAltered, d
	}
	return CauseSignatureMismatch, d
}

// bodyAltered re-serializes the received body through a JSON decode/encode cycle
// and, if the result differs from the received bytes, tests whether that
// re-encoded form matches (via the provided closure). A match is strong evidence
// that a middleware re-serialized the body after the provider signed the
// original bytes. UseNumber keeps large integers byte-stable across the cycle.
func bodyAltered(body []byte, matches func(b []byte) bool) (reencoded []byte, ok bool) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var v interface{}
	if err := dec.Decode(&v); err != nil {
		return nil, false
	}
	re, err := json.Marshal(v)
	if err != nil {
		return nil, false
	}
	if bytes.Equal(re, body) {
		return nil, false // nothing changed — not an alteration case
	}
	if matches(re) {
		return re, true
	}
	return nil, false
}

// encodingLabel is the human word for the opposite of enc.
func otherLabel(enc string) string {
	if enc == encBase64 {
		return encHex
	}
	return encBase64
}
