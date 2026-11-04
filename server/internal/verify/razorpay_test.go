package verify

import "testing"

// Self-generated fixtures (Razorpay publishes no reproducible webhook vector).
// Expected hex HMAC-SHA256 is computed independently in-test.
func TestRazorpay_Table(t *testing.T) {
	const secret = "razorpay_webhook_secret"
	body := `{"event":"payment.captured","payload":{"payment":{"id":"pay_1"}}}`
	good := macHexSHA256(secret, body)

	cases := []struct {
		name       string
		sig        string
		secret     string
		body       string
		wantStatus Status
		wantCause  Cause
	}{
		{"pass", good, secret, body, Pass, CauseOK},
		{"no_signature_header", "", secret, body, Unknown, CauseNoSignatureHeader},
		{"missing_secret", good, "", body, Unknown, CauseMissingSecret},
		{"signature_mismatch", macHexSHA256("wrong", body), secret, body, Fail, CauseSignatureMismatch},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hdr()
			if tc.sig != "" {
				h.Set("X-Razorpay-Signature", tc.sig)
			}
			in := Input{Provider: Razorpay, Secret: tc.secret, Body: []byte(tc.body), Headers: h}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

func TestRazorpay_EncodingMismatch(t *testing.T) {
	const secret = "razorpay_webhook_secret"
	body := `{"event":"payment.captured"}`
	in := Input{Provider: Razorpay, Secret: secret, Body: []byte(body),
		Headers: hdr("X-Razorpay-Signature", macB64SHA256(secret, body))}
	assertResult(t, Verify(in), Fail, CauseEncodingMismatch)
}

func TestRazorpay_BodyAltered(t *testing.T) {
	const secret = "razorpay_webhook_secret"
	compact := `{"id":"pay_xyz"}`
	pretty := "{\n  \"id\": \"pay_xyz\"\n}"
	in := Input{Provider: Razorpay, Secret: secret, Body: []byte(pretty),
		Headers: hdr("X-Razorpay-Signature", macHexSHA256(secret, compact))}
	assertResult(t, Verify(in), Fail, CauseBodyAltered)
}
