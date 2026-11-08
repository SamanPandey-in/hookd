package verify

import "testing"

// Independently-computed vector: proves the implementation matches Lemon
// Squeezy's documented hash_hmac('sha256', rawBody, secret) as lowercase hex.
// Precomputed offline (crypto/hmac, NOT via this package's Sign):
//
//	secret "lemon_whsec_pin_test_secret"
//	body   {"meta":{"event_name":"order_created"},"id":"evt_pin_0001"}
//	=> 7dcf228bbf800d8a1dd9aaae45b0e88aacbd63e186f4c7fbb81a2edfe75c2725
const (
	lemonVectorSecret = "lemon_whsec_pin_test_secret"
	lemonVectorBody   = `{"meta":{"event_name":"order_created"},"id":"evt_pin_0001"}`
	lemonVectorSig    = "7dcf228bbf800d8a1dd9aaae45b0e88aacbd63e186f4c7fbb81a2edfe75c2725"
)

func TestLemonSqueezy_PinnedVector(t *testing.T) {
	in := Input{Provider: LemonSqueezy, Secret: lemonVectorSecret, Body: []byte(lemonVectorBody),
		Headers: hdr("X-Signature", lemonVectorSig)}
	assertResult(t, Verify(in), Pass, CauseOK)

	// And our own Sign must reproduce the pinned hex exactly.
	sr := Sign(SignInput{Provider: LemonSqueezy, Secret: lemonVectorSecret, Body: []byte(lemonVectorBody)})
	if sr.Err != nil {
		t.Fatalf("Sign error: %v", sr.Err)
	}
	if got := sr.Headers["X-Signature"]; got != lemonVectorSig {
		t.Fatalf("Sign produced %q; want pinned %q", got, lemonVectorSig)
	}
}

func TestLemonSqueezy_RoundTrip(t *testing.T) {
	const secret = "lemon_roundtrip_secret"
	body := []byte(`{"meta":{"event_name":"subscription_created"},"data":{"type":"subscriptions","id":"1"}}`)

	sr := Sign(SignInput{Provider: LemonSqueezy, Secret: secret, Body: body})
	if sr.Err != nil {
		t.Fatalf("Sign error: %v", sr.Err)
	}
	in := Input{Provider: LemonSqueezy, Secret: secret, Body: body,
		Headers: hdr("X-Signature", sr.Headers["X-Signature"])}
	assertResult(t, Verify(in), Pass, CauseOK)
}

func TestLemonSqueezy_Table(t *testing.T) {
	const secret = "lemon_webhook_secret_123"
	body := `{"meta":{"event_name":"order_created"},"data":{"type":"orders","id":"1"}}`
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
		{"signature_mismatch_wrong_secret", macHexSHA256("wrong_secret", body), secret, body, Fail, CauseSignatureMismatch},
		{"signature_mismatch_tampered_body", good, secret, body + "!", Fail, CauseSignatureMismatch},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hdr()
			if tc.sig != "" {
				h.Set("X-Signature", tc.sig)
			}
			in := Input{Provider: LemonSqueezy, Secret: tc.secret, Body: []byte(tc.body), Headers: h}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

func TestLemonSqueezy_EncodingMismatch(t *testing.T) {
	const secret = "lemon_webhook_secret_123"
	body := `{"meta":{"event_name":"order_created"}}`
	// base64 where Lemon Squeezy expects hex.
	in := Input{Provider: LemonSqueezy, Secret: secret, Body: []byte(body),
		Headers: hdr("X-Signature", macB64SHA256(secret, body))}
	assertResult(t, Verify(in), Fail, CauseEncodingMismatch)
}

func TestLemonSqueezy_BodyAltered(t *testing.T) {
	const secret = "lemon_webhook_secret_123"
	compact := `{"id":"evt_xyz"}`
	pretty := "{\n  \"id\": \"evt_xyz\"\n}"
	in := Input{Provider: LemonSqueezy, Secret: secret, Body: []byte(pretty),
		Headers: hdr("X-Signature", macHexSHA256(secret, compact))}
	assertResult(t, Verify(in), Fail, CauseBodyAltered)
}

func TestLemonSqueezy_Detect(t *testing.T) {
	if p, ok := Detect(hdr("X-Signature", lemonVectorSig)); !ok || p != LemonSqueezy {
		t.Fatalf("Detect = (%q,%v); want (%q,true)", p, ok, LemonSqueezy)
	}
}
