package verify

import "testing"

// Twilio's auth token for every official worked vector below.
const twilioToken = "12345"

// TestTwilio_OfficialVector_Form is the MANDATORY correctness check: the exact
// request-validation vector published by Twilio (via the canonical twilio-python
// RequestValidator tests). We set the PUBLISHED X-Twilio-Signature and require a
// PASS, so the test can only succeed if our construction reproduces Twilio's own
// output byte-for-byte — a round-trip sign→verify alone would not prove that.
//   token "12345", URL "https://mycompany.com/myapp.php?foo=1&bar=2"
//   params CallSid, Caller, Digits, From, To  =>  "RSOYDt4T1cUTdK1PDd93/VVr8B8="
func TestTwilio_OfficialVector_Form(t *testing.T) {
	const (
		fullURL  = "https://mycompany.com/myapp.php?foo=1&bar=2"
		expected = "RSOYDt4T1cUTdK1PDd93/VVr8B8="
	)
	// Form body with the documented POST params, url-encoded on the wire (the
	// "+" in phone numbers is percent-encoded; the verifier url-decodes it).
	body := "CallSid=CA1234567890ABCDE&Caller=%2B14158675309&Digits=1234" +
		"&From=%2B14158675309&To=%2B18005551212"

	in := Input{
		Provider: Twilio,
		Secret:   twilioToken,
		Body:     []byte(body),
		URL:      fullURL,
		Headers: hdr(
			"Content-Type", "application/x-www-form-urlencoded",
			"X-Twilio-Signature", expected,
		),
	}
	got := Verify(in)
	assertResult(t, got, Pass, CauseOK)
	if got.Details["mode"] != "form-encoded" {
		t.Errorf("expected form-encoded mode, got %q", got.Details["mode"])
	}
}

// TestTwilio_OfficialVector_BodyHash pins the documented bodySHA256 value so the
// JSON-mode body hash cannot silently drift from Twilio's.
func TestTwilio_OfficialVector_BodyHash(t *testing.T) {
	const (
		body     = `{"property": "value", "boolean": true}`
		expected = "0a1ff7634d9ab3b95db5c9a2dfe9416e41502b283a80c7cf19632632f96e6620"
	)
	if got := sha256Hex([]byte(body)); got != expected {
		t.Fatalf("sha256Hex = %q, want Twilio's published %q", got, expected)
	}
}

// TestTwilio_OfficialVector_JSON validates the JSON (bodySHA256) scheme against
// Twilio's published signature for the URL-with-bodySHA256.
//   URL "...&bodySHA256=0a1ff…6620", body {"property":"value","boolean":true}
//   => "a9nBmqA0ju/hNViExpshrM61xv4="
func TestTwilio_OfficialVector_JSON(t *testing.T) {
	const (
		fullURL = "https://mycompany.com/myapp.php?foo=1&bar=2" +
			"&bodySHA256=0a1ff7634d9ab3b95db5c9a2dfe9416e41502b283a80c7cf19632632f96e6620"
		body     = `{"property": "value", "boolean": true}`
		expected = "a9nBmqA0ju/hNViExpshrM61xv4="
	)
	in := Input{
		Provider: Twilio,
		Secret:   twilioToken,
		Body:     []byte(body),
		URL:      fullURL,
		Headers: hdr(
			"Content-Type", "application/json",
			"X-Twilio-Signature", expected,
		),
	}
	got := Verify(in)
	assertResult(t, got, Pass, CauseOK)
	if got.Details["mode"] != "json (bodySHA256)" {
		t.Errorf("expected json mode, got %q", got.Details["mode"])
	}
}

// TestTwilio_Table covers the form scheme's status/cause matrix using
// independently computed signatures (not the engine's own Sign).
func TestTwilio_Table(t *testing.T) {
	const (
		secret  = "twilio_auth_token_demo"
		fullURL = "https://api.example.com/i/ep_demo?x=1"
	)
	body := "Body=hello+world&From=%2B15550001111&MessageSid=SM0001&To=%2B15550002222"
	// Independent expected signature: URL + sorted(key+decodedValue), HMAC-SHA1 b64.
	// keys sorted: Body, From, MessageSid, To.
	data := fullURL + "Body" + "hello world" + "From" + "+15550001111" +
		"MessageSid" + "SM0001" + "To" + "+15550002222"
	good := macB64SHA1(secret, data)

	cases := []struct {
		name       string
		sig        string
		secret     string
		url        string
		body       string
		wantStatus Status
		wantCause  Cause
	}{
		{"pass", good, secret, fullURL, body, Pass, CauseOK},
		{"no_signature_header", "", secret, fullURL, body, Unknown, CauseNoSignatureHeader},
		{"missing_secret", good, "", fullURL, body, Unknown, CauseMissingSecret},
		{"wrong_secret", macB64SHA1("nope", data), secret, fullURL, body, Fail, CauseSignatureMismatch},
		{"tampered_param", good, secret, fullURL,
			"Body=HELLO&From=%2B15550001111&MessageSid=SM0001&To=%2B15550002222", Fail, CauseSignatureMismatch},
		{"wrong_url", good, secret, "https://evil.example.com/i/ep_demo?x=1", body, Fail, CauseSignatureMismatch},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hdr("Content-Type", "application/x-www-form-urlencoded")
			if tc.sig != "" {
				h.Set("X-Twilio-Signature", tc.sig)
			}
			in := Input{Provider: Twilio, Secret: tc.secret, Body: []byte(tc.body), URL: tc.url, Headers: h}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

// TestTwilio_FormRoundTrip: Sign then Verify (same URL) must PASS.
func TestTwilio_FormRoundTrip(t *testing.T) {
	const (
		secret  = "twilio_auth_token_demo"
		fullURL = "https://api.example.com/i/ep_demo?x=1"
	)
	body := []byte("MessageSid=SM0001&From=%2B15550001111&To=%2B15550002222&Body=hi")

	sr := Sign(SignInput{Provider: Twilio, Secret: secret, Body: body, URL: fullURL})
	if sr.Err != nil {
		t.Fatalf("sign: %v", sr.Err)
	}
	if sr.URL != "" {
		t.Errorf("form-mode Sign must not rewrite the URL, got %q", sr.URL)
	}
	h := hdr("Content-Type", "application/x-www-form-urlencoded")
	for k, v := range sr.Headers {
		h.Set(k, v)
	}
	assertResult(t, Verify(Input{Provider: Twilio, Secret: secret, Body: body, URL: fullURL, Headers: h}), Pass, CauseOK)
}

// TestTwilio_JSONRoundTrip: JSON-mode Sign appends bodySHA256 to the URL and
// returns it; verifying against that rewritten URL must PASS. Tampering the body
// afterward keeps the URL signature valid but breaks the body hash → BodyAltered.
func TestTwilio_JSONRoundTrip(t *testing.T) {
	const (
		secret  = "twilio_auth_token_demo"
		fullURL = "https://api.example.com/hook?a=1"
	)
	body := []byte(`{"event":"delivered","sid":"SM0001"}`)

	sr := Sign(SignInput{Provider: Twilio, Secret: secret, Body: body, URL: fullURL})
	if sr.Err != nil {
		t.Fatalf("sign: %v", sr.Err)
	}
	if sr.URL == "" {
		t.Fatal("json-mode Sign must return the rewritten URL (with bodySHA256)")
	}
	h := hdr("Content-Type", "application/json")
	for k, v := range sr.Headers {
		h.Set(k, v)
	}
	assertResult(t, Verify(Input{Provider: Twilio, Secret: secret, Body: body, URL: sr.URL, Headers: h}), Pass, CauseOK)

	// Tamper the body: URL (and its bodySHA256) is unchanged, so the URL
	// signature still matches but the body hash no longer does.
	assertResult(t, Verify(Input{
		Provider: Twilio, Secret: secret, Body: []byte(`{"event":"failed","sid":"SM0001"}`),
		URL: sr.URL, Headers: h,
	}), Fail, CauseBodyAltered)
}

func TestTwilio_Detect(t *testing.T) {
	p, ok := Detect(hdr("X-Twilio-Signature", "abc"))
	if !ok || p != Twilio {
		t.Fatalf("Detect should recognize X-Twilio-Signature as Twilio, got %q ok=%v", p, ok)
	}
}
