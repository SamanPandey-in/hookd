package verify

import "testing"

// Official GitHub worked example, cited from
// https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
// (confirmed live 2026-11-03, and recomputed independently in a scratch program):
//
//	secret "It's a Secret to Everybody" + body "Hello, World!"
//	=> sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17
const (
	ghVectorSecret = "It's a Secret to Everybody"
	ghVectorBody   = "Hello, World!"
	ghVectorSig    = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17"
)

func TestGitHub_OfficialVector(t *testing.T) {
	in := Input{Provider: GitHub, Secret: ghVectorSecret, Body: []byte(ghVectorBody),
		Headers: hdr("X-Hub-Signature-256", ghVectorSig)}
	assertResult(t, Verify(in), Pass, CauseOK)
}

func TestGitHub_Table(t *testing.T) {
	const secret = "gh_webhook_secret_123"
	body := `{"zen":"Non-blocking is better than blocking.","hook_id":1}`
	good := "sha256=" + macHexSHA256(secret, body)

	cases := []struct {
		name         string
		sig256, sig1 string
		secret, body string
		wantStatus   Status
		wantCause    Cause
	}{
		{"pass_sha256", good, "", secret, body, Pass, CauseOK},
		{"no_signature_header", "", "", secret, body, Unknown, CauseNoSignatureHeader},
		{"malformed_header", "deadbeef_no_prefix", "", secret, body, Fail, CauseMalformedHeader},
		{"missing_secret", good, "", "", body, Unknown, CauseMissingSecret},
		{"signature_mismatch", "sha256=" + macHexSHA256("wrong_secret", body), "", secret, body, Fail, CauseSignatureMismatch},
		{"legacy_sha1_pass", "", "sha1=" + macHexSHA1(secret, body), secret, body, Pass, CauseOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hdr()
			if tc.sig256 != "" {
				h.Set("X-Hub-Signature-256", tc.sig256)
			}
			if tc.sig1 != "" {
				h.Set("X-Hub-Signature", tc.sig1)
			}
			in := Input{Provider: GitHub, Secret: tc.secret, Body: []byte(tc.body), Headers: h}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

func TestGitHub_EncodingMismatch(t *testing.T) {
	const secret = "gh_webhook_secret_123"
	body := `{"action":"opened"}`
	// base64 where GitHub expects hex.
	in := Input{Provider: GitHub, Secret: secret, Body: []byte(body),
		Headers: hdr("X-Hub-Signature-256", "sha256="+macB64SHA256(secret, body))}
	assertResult(t, Verify(in), Fail, CauseEncodingMismatch)
}

func TestGitHub_BodyAltered(t *testing.T) {
	const secret = "gh_webhook_secret_123"
	compact := `{"id":"delivery_1"}`
	pretty := "{\n    \"id\": \"delivery_1\"\n}"
	in := Input{Provider: GitHub, Secret: secret, Body: []byte(pretty),
		Headers: hdr("X-Hub-Signature-256", "sha256="+macHexSHA256(secret, compact))}
	assertResult(t, Verify(in), Fail, CauseBodyAltered)
}
