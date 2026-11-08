package verify

// Twilio request signatures.
// Scheme (verified against https://www.twilio.com/docs/usage/security and the
// canonical twilio-python RequestValidator, 2026-11-08):
//   Header: X-Twilio-Signature: base64(HMAC-SHA1(authToken, data)).
//   The auth token is used verbatim as the HMAC key. There is no timestamp /
//   replay window — the signature is bound to the exact request URL instead, so
//   verification needs the full external URL (scheme+host+path+exact query), not
//   just headers+body. No URL (or the wrong one) is the defining Twilio failure.
//
//   Form-encoded mode (Content-Type: application/x-www-form-urlencoded —
//   Twilio's messaging/voice webhooks):
//     data = URL + concat(for each POST param, keys sorted ascending, then that
//            key's url-decoded values sorted+deduped ascending: key + value)
//            with NO separators.
//
//   JSON mode (any non-form body — Twilio Event Streams):
//     Twilio appends a bodySHA256=<hex sha256 of the raw body> query param to the
//     URL and signs the full URL. Verification is (a) the HMAC over the full URL
//     matches AND (b) sha256hex(rawBody) equals the bodySHA256 query value.
//
// Official worked vector (twilio-python tests, cited in twilio_test.go):
//   token "12345", URL "https://mycompany.com/myapp.php?foo=1&bar=2",
//   params {CallSid:CA1234567890ABCDE, Caller:+14158675309, Digits:1234,
//   From:+14158675309, To:+18005551212} => X-Twilio-Signature
//   "RSOYDt4T1cUTdK1PDd93/VVr8B8=".

import (
	"net/url"
	"sort"
	"strings"
)

const (
	twilioHeader         = "X-Twilio-Signature"
	twilioFormContentCT  = "application/x-www-form-urlencoded"
	twilioBodyHashQuery  = "bodySHA256"
	twilioModeFormLabel  = "form-encoded"
	twilioModeJSONLabel  = "json (bodySHA256)"
	twilioSignatureAlgo1 = algoSHA1
)

type twilioVerifier struct{}

func (twilioVerifier) Provider() Provider { return Twilio }

func (twilioVerifier) Verify(in Input) Result {
	sig := strings.TrimSpace(in.Headers.Get(twilioHeader))
	if sig == "" {
		return result(Twilio, Unknown, CauseNoSignatureHeader,
			"no X-Twilio-Signature header on the request", nil)
	}
	if in.Secret == "" {
		return result(Twilio, Unknown, CauseMissingSecret,
			"no auth token configured — paste your Twilio account auth token to verify", nil)
	}

	d := map[string]string{
		"algo":     twilioSignatureAlgo1,
		"encoding": encBase64,
		"provided": clip(sig),
		"url":      clip(in.URL),
	}
	if in.URL == "" {
		d["url"] = "(none provided)"
	}

	if twilioIsJSONMode(in.Headers.Get("Content-Type"), in.URL) {
		return twilioVerifyJSON(in, sig, d)
	}
	return twilioVerifyForm(in, sig, d)
}

// twilioVerifyForm handles the messaging/voice form-encoded scheme.
func twilioVerifyForm(in Input, sig string, d map[string]string) Result {
	d["mode"] = twilioModeFormLabel
	data := twilioFormData(in.URL, in.Body)
	want := b64Enc(hmac1([]byte(in.Secret), []byte(data)))
	d["computed"] = clip(want)

	if ctEqualStr(sig, want) {
		return result(Twilio, Pass, CauseOK,
			twilioSignatureAlgo1+" · base64 · url-bound · auth token "+secretHint(in.Secret)+"matched", d)
	}
	return result(Twilio, Fail, CauseSignatureMismatch,
		"computed signature ("+clip(want)+") ≠ X-Twilio-Signature — wrong auth token, or the signed "+
			"URL differs (Twilio signs the exact URL it called; a proxy that rewrites host/path breaks it)", d)
}

// twilioVerifyJSON handles the Event-Streams JSON scheme (bodySHA256 on the URL).
func twilioVerifyJSON(in Input, sig string, d map[string]string) Result {
	d["mode"] = twilioModeJSONLabel
	want := b64Enc(hmac1([]byte(in.Secret), []byte(in.URL)))
	d["computed"] = clip(want)

	bodyHash := sha256Hex(in.Body)
	provHash := twilioQueryValue(in.URL, twilioBodyHashQuery)
	d["body_sha256"] = clip(bodyHash)
	d["url_body_sha256"] = clip(provHash)

	sigOK := ctEqualStr(sig, want)
	hashOK := provHash != "" && ctEqualStr(bodyHash, provHash)

	if sigOK && hashOK {
		return result(Twilio, Pass, CauseOK,
			twilioSignatureAlgo1+" · base64 · url-bound · bodySHA256 matched · auth token "+
				secretHint(in.Secret)+"matched", d)
	}
	if sigOK && !hashOK {
		// The URL signature is authentic but the body hash on the URL does not
		// match the received body — the body was altered in transit.
		return result(Twilio, Fail, CauseBodyAltered,
			"URL signature matched but sha256(body) ≠ the bodySHA256 on the URL — the body was "+
				"altered after Twilio signed it; verify the raw bytes", d)
	}
	return result(Twilio, Fail, CauseSignatureMismatch,
		"computed signature ("+clip(want)+") ≠ X-Twilio-Signature — wrong auth token, or the signed "+
			"URL differs (Twilio signs the exact URL it called; a proxy that rewrites host/path breaks it)", d)
}

type twilioSigner struct{}

func (twilioSigner) Provider() Provider { return Twilio }

func (twilioSigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(Twilio)}
	}
	// No Content-Type is available on SignInput, so the mode is inferred from the
	// body shape: a JSON object/array body uses the bodySHA256 scheme, anything
	// else (e.g. a form-encoded messaging payload) uses the form scheme.
	if twilioBodyLooksJSON(in.Body) {
		signedURL := twilioAppendBodyHash(in.URL, sha256Hex(in.Body))
		sig := b64Enc(hmac1([]byte(in.Secret), []byte(signedURL)))
		return SignResult{
			Headers: map[string]string{twilioHeader: sig},
			URL:     signedURL, // caller must send to this URL (bodySHA256 appended)
		}
	}
	data := twilioFormData(in.URL, in.Body)
	sig := b64Enc(hmac1([]byte(in.Secret), []byte(data)))
	return SignResult{Headers: map[string]string{twilioHeader: sig}}
}

func init() {
	Default.Register(twilioVerifier{})
	RegisterSigner(twilioSigner{})
}

// twilioFormData builds the signed string for the form-encoded scheme:
// the URL followed by each POST param (keys sorted ascending; each key's
// url-decoded values sorted+deduped ascending) concatenated with no separators.
func twilioFormData(fullURL string, body []byte) string {
	var b strings.Builder
	b.WriteString(fullURL)
	vals, err := url.ParseQuery(string(body))
	if err != nil {
		return b.String() // unparseable body → sign the URL alone (will not match)
	}
	keys := make([]string, 0, len(vals))
	for k := range vals {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		vs := append([]string(nil), vals[k]...)
		sort.Strings(vs)
		vs = dedupeSorted(vs)
		for _, v := range vs {
			b.WriteString(k)
			b.WriteString(v)
		}
	}
	return b.String()
}

// dedupeSorted removes consecutive duplicates from an already-sorted slice
// (mirrors Twilio's sorted(set(values))).
func dedupeSorted(s []string) []string {
	if len(s) < 2 {
		return s
	}
	out := s[:1]
	for _, v := range s[1:] {
		if v != out[len(out)-1] {
			out = append(out, v)
		}
	}
	return out
}

// twilioIsJSONMode decides the scheme for verification: a bodySHA256 on the URL
// forces JSON mode; otherwise the form scheme is used only for an explicit
// application/x-www-form-urlencoded content type; anything else is JSON mode.
func twilioIsJSONMode(contentType, fullURL string) bool {
	if twilioQueryValue(fullURL, twilioBodyHashQuery) != "" {
		return true
	}
	return !twilioIsFormContentType(contentType)
}

func twilioIsFormContentType(ct string) bool {
	mt := strings.ToLower(strings.TrimSpace(ct))
	if i := strings.IndexByte(mt, ';'); i >= 0 {
		mt = strings.TrimSpace(mt[:i])
	}
	return mt == twilioFormContentCT
}

// twilioBodyLooksJSON reports whether a body is a JSON object/array (used by the
// signer to pick the scheme, since SignInput carries no Content-Type).
func twilioBodyLooksJSON(body []byte) bool {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return false
	}
	return trimmed[0] == '{' || trimmed[0] == '['
}

// twilioQueryValue returns the first value of query param name in rawURL, or "".
func twilioQueryValue(rawURL, name string) string {
	i := strings.IndexByte(rawURL, '?')
	if i < 0 {
		return ""
	}
	vals, err := url.ParseQuery(rawURL[i+1:])
	if err != nil {
		return ""
	}
	return vals.Get(name)
}

// twilioAppendBodyHash appends bodySHA256=<hash> to rawURL's query, returning the
// exact string that is both signed and sent (so the two never diverge).
func twilioAppendBodyHash(rawURL, hash string) string {
	sep := "?"
	if strings.Contains(rawURL, "?") {
		sep = "&"
	}
	return rawURL + sep + twilioBodyHashQuery + "=" + hash
}
