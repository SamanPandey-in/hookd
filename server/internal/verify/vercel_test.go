package verify

import "testing"

// Independently-computed vector: proves the implementation matches Vercel's
// documented createHmac('sha1', secret).update(rawBody).digest('hex').
// Precomputed offline (crypto/hmac, not via this package's Sign):
//
//	secret "vercel_whsec_pin_test_secret"
//	body   {"type":"deployment.succeeded","id":"evt_pin_0001"}
//	=> 6e10068fc162184cc5f27c1364bcd7c3c89faa56
const (
	vercelVectorSecret = "vercel_whsec_pin_test_secret"
	vercelVectorBody   = `{"type":"deployment.succeeded","id":"evt_pin_0001"}`
	vercelVectorSig    = "6e10068fc162184cc5f27c1364bcd7c3c89faa56"
)

func TestVercel_PinnedVector(t *testing.T) {
	in := Input{Provider: Vercel, Secret: vercelVectorSecret, Body: []byte(vercelVectorBody),
		Headers: hdr("x-vercel-signature", vercelVectorSig)}
	assertResult(t, Verify(in), Pass, CauseOK)

	// And our own Sign must reproduce the pinned hex exactly.
	sr := Sign(SignInput{Provider: Vercel, Secret: vercelVectorSecret, Body: []byte(vercelVectorBody)})
	if sr.Err != nil {
		t.Fatalf("Sign error: %v", sr.Err)
	}
	if got := sr.Headers["x-vercel-signature"]; got != vercelVectorSig {
		t.Fatalf("Sign produced %q; want pinned %q", got, vercelVectorSig)
	}
}

func TestVercel_RoundTrip(t *testing.T) {
	const secret = "vercel_roundtrip_secret"
	body := []byte(`{"type":"deployment.created","id":"evt_rt_0001","payload":{"deployment":{"id":"dpl_rt"}}}`)

	sr := Sign(SignInput{Provider: Vercel, Secret: secret, Body: body})
	if sr.Err != nil {
		t.Fatalf("Sign error: %v", sr.Err)
	}
	in := Input{Provider: Vercel, Secret: secret, Body: body,
		Headers: hdr("x-vercel-signature", sr.Headers["x-vercel-signature"])}
	assertResult(t, Verify(in), Pass, CauseOK)
}

func TestVercel_Table(t *testing.T) {
	const secret = "vercel_webhook_secret_123"
	body := `{"type":"deployment.succeeded","id":"evt_1","payload":{"deployment":{"id":"dpl_1"}}}`
	good := macHexSHA1(secret, body)

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
		{"signature_mismatch_wrong_secret", macHexSHA1("wrong_secret", body), secret, body, Fail, CauseSignatureMismatch},
		{"signature_mismatch_tampered_body", good, secret, body + "!", Fail, CauseSignatureMismatch},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hdr()
			if tc.sig != "" {
				h.Set("x-vercel-signature", tc.sig)
			}
			in := Input{Provider: Vercel, Secret: tc.secret, Body: []byte(tc.body), Headers: h}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

func TestVercel_EncodingMismatch(t *testing.T) {
	const secret = "vercel_webhook_secret_123"
	body := `{"type":"deployment.succeeded"}`
	// base64 where Vercel expects hex.
	in := Input{Provider: Vercel, Secret: secret, Body: []byte(body),
		Headers: hdr("x-vercel-signature", macB64SHA1(secret, body))}
	assertResult(t, Verify(in), Fail, CauseEncodingMismatch)
}

func TestVercel_Detect(t *testing.T) {
	if p, ok := Detect(hdr("x-vercel-signature", vercelVectorSig)); !ok || p != Vercel {
		t.Fatalf("Detect = (%q,%v); want (%q,true)", p, ok, Vercel)
	}
}
