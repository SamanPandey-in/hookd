package verify

import "testing"

// Self-generated fixtures. Shopify emits base64 — the encoding_mismatch test
// below is the headline teaching case (hex secret vs base64 header).
func TestShopify_Table(t *testing.T) {
	const secret = "shopify_app_client_secret"
	body := `{"id":820982911946154508,"email":"jon@example.com"}`
	good := macB64SHA256(secret, body)

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
		{"signature_mismatch", macB64SHA256("wrong", body), secret, body, Fail, CauseSignatureMismatch},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hdr()
			if tc.sig != "" {
				h.Set("X-Shopify-Hmac-Sha256", tc.sig)
			}
			in := Input{Provider: Shopify, Secret: tc.secret, Body: []byte(tc.body), Headers: h}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

// The canonical encoding mix-up: the integrator hex-encoded the digest, but
// Shopify sends base64. Same digest, wrong encoding — we must name it precisely.
func TestShopify_EncodingMismatch_HexWhereBase64Expected(t *testing.T) {
	const secret = "shopify_app_client_secret"
	body := `{"id":820982911946154508}`
	in := Input{Provider: Shopify, Secret: secret, Body: []byte(body),
		Headers: hdr("X-Shopify-Hmac-Sha256", macHexSHA256(secret, body))}
	got := Verify(in)
	assertResult(t, got, Fail, CauseEncodingMismatch)
	if got.Details["encoding"] != "base64" {
		t.Errorf("expected canonical encoding base64 in details, got %q", got.Details["encoding"])
	}
}

func TestShopify_BodyAltered(t *testing.T) {
	const secret = "shopify_app_client_secret"
	compact := `{"id":"gid_123"}`
	pretty := "{\n  \"id\": \"gid_123\"\n}"
	in := Input{Provider: Shopify, Secret: secret, Body: []byte(pretty),
		Headers: hdr("X-Shopify-Hmac-Sha256", macB64SHA256(secret, compact))}
	assertResult(t, Verify(in), Fail, CauseBodyAltered)
}
