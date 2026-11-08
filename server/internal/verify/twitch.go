package verify

// Twitch EventSub webhook signatures.
// Scheme (verified against
// https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#verifying-the-event-message ,
// 2026-11-09):
//   Headers: Twitch-Eventsub-Message-Id, Twitch-Eventsub-Message-Timestamp (RFC3339),
//            Twitch-Eventsub-Message-Signature: "sha256=<hex HMAC-SHA256>".
//   HMAC message = <message-id> + <timestamp> + <rawbody>  (plain concatenation,
//   no separators). Digest HMAC-SHA256, hex, "sha256=" prefix. Secret is the
//   EventSub subscription secret, used verbatim as the HMAC key.
//   Replay tolerance: Twitch recommends rejecting messages older than 10 minutes.

import (
	"strconv"
	"strings"
	"time"

	"crypto/rand"
	"encoding/hex"
)

const (
	twitchHeaderID  = "Twitch-Eventsub-Message-Id"
	twitchHeaderTS  = "Twitch-Eventsub-Message-Timestamp"
	twitchHeaderSig = "Twitch-Eventsub-Message-Signature"
	twitchPrefix    = "sha256="
	// twitchTolerance is Twitch's recommended replay window: 10 minutes.
	twitchTolerance = 600
)

// twitchToleranceOf lets a caller override the window but defaults to Twitch's
// recommended 10 minutes (the engine-wide default is 5 minutes).
func twitchToleranceOf(in Input) int {
	if in.ToleranceSeconds > 0 {
		return in.ToleranceSeconds
	}
	return twitchTolerance
}

type twitchVerifier struct{}

func (twitchVerifier) Provider() Provider { return Twitch }

func (twitchVerifier) Verify(in Input) Result {
	sig := strings.TrimSpace(in.Headers.Get(twitchHeaderSig))
	id := strings.TrimSpace(in.Headers.Get(twitchHeaderID))
	tsStr := strings.TrimSpace(in.Headers.Get(twitchHeaderTS))

	// Missing any of the three required headers → no signature to verify.
	if sig == "" || id == "" || tsStr == "" {
		return result(Twitch, Unknown, CauseNoSignatureHeader,
			"no Twitch-Eventsub-Message-* signature headers on the request "+
				"(need Message-Id, Message-Timestamp and Message-Signature)", nil)
	}
	if !strings.HasPrefix(sig, twitchPrefix) {
		return result(Twitch, Fail, CauseMalformedHeader,
			"Twitch-Eventsub-Message-Signature is malformed (expected \"sha256=<hex>\")",
			map[string]string{"header": clip(sig)})
	}
	provided := strings.TrimPrefix(sig, twitchPrefix)
	ts, tsOK := parseRFC3339Unix(tsStr)
	if !tsOK {
		return result(Twitch, Fail, CauseMalformedHeader,
			"Twitch-Eventsub-Message-Timestamp is not an RFC3339 time",
			map[string]string{"timestamp": clip(tsStr)})
	}
	if in.Secret == "" {
		return result(Twitch, Unknown, CauseMissingSecret,
			"no signing secret configured — paste your EventSub subscription secret to verify", nil)
	}

	msg := []byte(id + tsStr + string(in.Body))
	rawDigest := hmac256([]byte(in.Secret), msg)
	want := encode(encHex, rawDigest)
	matched := ctEqualStr(provided, want)

	d := map[string]string{
		"scheme":            "sha256",
		"algo":              algoSHA256,
		"encoding":          encHex,
		"computed":          clip(want),
		"provided":          clip(provided),
		"tolerance_seconds": strconv.Itoa(twitchToleranceOf(in)),
	}

	if matched {
		skew := skewSeconds(in.EffectiveNow(), ts)
		d["skew_seconds"] = strconv.FormatInt(skew, 10)
		if int(skew) > twitchToleranceOf(in) {
			return result(Twitch, Fail, CauseTimestampSkew,
				"signature matched but timestamp skew "+strconv.FormatInt(skew, 10)+"s > "+
					strconv.Itoa(twitchToleranceOf(in))+"s tolerance (stale/replayed event)", d)
		}
		return result(Twitch, Pass, CauseOK,
			"scheme sha256 · "+algoSHA256+" · timestamp within "+strconv.Itoa(twitchToleranceOf(in))+
				"s · secret "+secretHint(in.Secret)+"matched", d)
	}

	cause, hd := classifyHMAC(rawDigest, provided, encHex, in.Body, func(b []byte) bool {
		return ctEqualStr(provided, encode(encHex, hmac256([]byte(in.Secret), []byte(id+tsStr+string(b)))))
	})
	for k, v := range hd {
		d[k] = v
	}
	switch cause {
	case CauseEncodingMismatch:
		return result(Twitch, Fail, CauseEncodingMismatch,
			"signature looks like "+otherLabel(encHex)+" but Twitch uses "+encHex+
				" — same digest, wrong encoding", d)
	case CauseBodyAltered:
		return result(Twitch, Fail, CauseBodyAltered,
			"computed signature ≠ header, but the body re-serialized would match — a parser likely "+
				"mutated the body; sign the raw bytes", d)
	default:
		return result(Twitch, Fail, CauseSignatureMismatch,
			"computed sha256 ("+clip(want)+") ≠ header — wrong secret or the signed content "+
				"(messageId+timestamp+body) differs", d)
	}
}

type twitchSigner struct{}

func (twitchSigner) Provider() Provider { return Twitch }

func (twitchSigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(Twitch)}
	}
	// A fresh message id and the current timestamp so a replayed event lands
	// inside the tolerance window and verifies PASS.
	id := twitchMessageID()
	ts := in.EffectiveNow().UTC().Format(time.RFC3339)
	sig := hexEnc(hmac256([]byte(in.Secret), []byte(id+ts+string(in.Body))))
	return SignResult{Headers: map[string]string{
		twitchHeaderID:  id,
		twitchHeaderTS:  ts,
		twitchHeaderSig: twitchPrefix + sig,
	}}
}

func init() {
	Default.Register(twitchVerifier{})
	RegisterSigner(twitchSigner{})
}

// parseRFC3339Unix parses an RFC3339 timestamp and returns its unix seconds.
func parseRFC3339Unix(s string) (int64, bool) {
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(s))
	if err != nil {
		return 0, false
	}
	return t.Unix(), true
}

// twitchMessageID returns a random UUID-style message id. It falls back to a
// deterministic hex id if the system CSPRNG is unavailable (never in practice),
// which is fine: the id is a nonce, not a secret.
func twitchMessageID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "msg_0000000000000000000000000000000000000000"
	}
	// RFC 4122 version 4 variant bits (cosmetic; Twitch only needs uniqueness).
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b[:])
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}
