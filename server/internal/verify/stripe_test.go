package verify

import (
	"testing"
	"time"
)

// Stripe fixtures are self-generated (Stripe publishes no reproducible vector
// with a secret). The expected signature is computed independently in-test from
// crypto/hmac — see testutil_test.go — so a PASS is a real cross-check.
const (
	stripeSecret = "whsec_test_51H8sampleSecretValue0000000000"
	stripeBody   = `{"id":"evt_1","object":"event","type":"payment_intent.succeeded"}`
)

func stripeHeaderFor(t string, body, secret string) string {
	return "t=" + t + ",v1=" + macHexSHA256(secret, t+"."+body)
}

func TestStripe_Table(t *testing.T) {
	ts := fixedNow.Unix()
	tsStr := time.Unix(ts, 0).UTC()
	_ = tsStr
	now := fixedNow

	tStr := itoa64(ts)
	goodHeader := stripeHeaderFor(tStr, stripeBody, stripeSecret)

	tests := []struct {
		name       string
		header     string
		secret     string
		body       string
		now        time.Time
		wantStatus Status
		wantCause  Cause
	}{
		{"pass", goodHeader, stripeSecret, stripeBody, now, Pass, CauseOK},
		{"no_signature_header", "", stripeSecret, stripeBody, now, Unknown, CauseNoSignatureHeader},
		{"malformed_header", "v1=deadbeef", stripeSecret, stripeBody, now, Fail, CauseMalformedHeader},
		{"malformed_timestamp", "t=notanumber,v1=deadbeef", stripeSecret, stripeBody, now, Fail, CauseMalformedHeader},
		{"missing_secret", goodHeader, "", stripeBody, now, Unknown, CauseMissingSecret},
		{"signature_mismatch_wrong_secret", stripeHeaderFor(tStr, stripeBody, "whsec_wrong"), stripeSecret, stripeBody, now, Fail, CauseSignatureMismatch},
		{"timestamp_out_of_tolerance", goodHeader, stripeSecret, stripeBody, now.Add(601 * time.Second), Fail, CauseTimestampSkew},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := Input{Provider: Stripe, Secret: tc.secret, Body: []byte(tc.body),
				Headers: hdr("Stripe-Signature", tc.header), Now: tc.now}
			if tc.header == "" {
				in.Headers = hdr()
			}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

func TestStripe_MultipleV1_OneMatches(t *testing.T) {
	tStr := itoa64(fixedNow.Unix())
	good := macHexSHA256(stripeSecret, tStr+"."+stripeBody)
	header := "t=" + tStr + ",v1=" + "00deadbeef" + ",v1=" + good // first is wrong, second right
	in := Input{Provider: Stripe, Secret: stripeSecret, Body: []byte(stripeBody),
		Headers: hdr("Stripe-Signature", header), Now: fixedNow}
	assertResult(t, Verify(in), Pass, CauseOK)
}

func TestStripe_EncodingMismatch(t *testing.T) {
	tStr := itoa64(fixedNow.Unix())
	// Provide the base64 form where Stripe expects hex (same digest, wrong enc).
	b64 := macB64SHA256(stripeSecret, tStr+"."+stripeBody)
	header := "t=" + tStr + ",v1=" + b64
	in := Input{Provider: Stripe, Secret: stripeSecret, Body: []byte(stripeBody),
		Headers: hdr("Stripe-Signature", header), Now: fixedNow}
	assertResult(t, Verify(in), Fail, CauseEncodingMismatch)
}

func TestStripe_BodyAltered(t *testing.T) {
	compact := `{"id":"evt_abc123"}`
	pretty := "{\n  \"id\": \"evt_abc123\"\n}"
	tStr := itoa64(fixedNow.Unix())
	// Signature was produced over the compact bytes the provider actually sent;
	// a middleware pretty-printed the body before it reached us.
	header := "t=" + tStr + ",v1=" + macHexSHA256(stripeSecret, tStr+"."+compact)
	in := Input{Provider: Stripe, Secret: stripeSecret, Body: []byte(pretty),
		Headers: hdr("Stripe-Signature", header), Now: fixedNow}
	assertResult(t, Verify(in), Fail, CauseBodyAltered)
}
