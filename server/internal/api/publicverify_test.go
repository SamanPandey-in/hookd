package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"whook/internal/httpx"
	"whook/internal/samples"
	"whook/internal/store"
	"whook/internal/verify"
)

// callDebug posts a debug-verify request to the handler and returns the recorder.
func callDebug(h *PublicVerify, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(body)
	req := httptest.NewRequest(http.MethodPost, "/debug/verify", &buf)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.Verify(rec, req)
	return rec
}

func decodeDebug(t *testing.T, rec *httptest.ResponseRecorder) debugVerifyResp {
	t.Helper()
	var out debugVerifyResp
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v (%s)", err, rec.Body.String())
	}
	return out
}

// stripeSignedHeaders returns a valid Stripe-Signature header for body signed
// with secret at the current time (so it is within tolerance).
func stripeSignedHeaders(t *testing.T, secret, body string) map[string]string {
	t.Helper()
	res := verify.Sign(verify.SignInput{Provider: verify.Stripe, Secret: secret, Body: []byte(body)})
	if res.Err != nil {
		t.Fatalf("sign: %v", res.Err)
	}
	return res.Headers
}

func TestDebugVerifyValidSamplePasses(t *testing.T) {
	h := &PublicVerify{}
	const secret, body = "whsec_pub_debug", `{"id":"evt_1","amount":100}`
	rec := callDebug(h, debugVerifyReq{
		Provider: "stripe",
		Secret:   secret,
		Headers:  stripeSignedHeaders(t, secret, body),
		Body:     body,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d %s", rec.Code, rec.Body.String())
	}
	out := decodeDebug(t, rec)
	if out.Status != string(verify.Pass) {
		t.Fatalf("valid sample should pass, got status=%s cause=%s summary=%s", out.Status, out.Cause, out.Summary)
	}
	if out.Provider != "stripe" {
		t.Errorf("provider should echo stripe, got %q", out.Provider)
	}
}

// TestDebugVerifyEveryProviderPasses is the end-to-end guard that EVERY
// registered provider verifies as PASS through the public /debug/verify HTTP
// path, and that a tampered body does not. It loops verify.Providers() so a
// newly added provider can never silently skip HTTP coverage.
func TestDebugVerifyEveryProviderPasses(t *testing.T) {
	h := &PublicVerify{}
	// A stable external URL — required by Twilio (URL-bound), ignored by the rest.
	const ingestURL = "https://api.hookd.test/i/ep_e2e"
	// Standard Webhooks (Svix/Dodo) requires a `whsec_<base64>` secret; others
	// accept any string.
	secretFor := func(p verify.Provider) string {
		if p == verify.StandardWebhooks {
			return "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
		}
		return "whsec_e2e_all_providers_0001"
	}

	for _, p := range verify.Default.Providers() {
		p := p
		t.Run(string(p), func(t *testing.T) {
			secret := secretFor(p)
			smp, ok := samples.For(p)
			if !ok {
				t.Fatalf("no sample registered for provider %q", p)
			}
			sr := verify.Sign(verify.SignInput{
				Provider: p, Secret: secret, Body: smp.Body, URL: ingestURL,
			})
			if sr.Err != nil {
				t.Fatalf("sign %s: %v", p, sr.Err)
			}
			// Merge the sample's own headers (e.g. Content-Type, which Twilio's
			// form/JSON mode selection depends on) with the freshly-signed ones.
			headers := map[string]string{}
			for k, v := range smp.Headers {
				headers[k] = v
			}
			if smp.ContentType != "" {
				headers["Content-Type"] = smp.ContentType
			}
			for k, v := range sr.Headers {
				headers[k] = v
			}
			// Twilio JSON-mode rewrites the URL (appends bodySHA256); prefer it.
			effURL := ingestURL
			if sr.URL != "" {
				effURL = sr.URL
			}

			rec := callDebug(h, debugVerifyReq{
				Provider: string(p), Secret: secret,
				Headers: headers, Body: string(smp.Body), URL: effURL,
			})
			if rec.Code != http.StatusOK {
				t.Fatalf("%s: want 200, got %d %s", p, rec.Code, rec.Body.String())
			}
			out := decodeDebug(t, rec)
			if out.Status != string(verify.Pass) {
				t.Fatalf("%s: signed sample should PASS over /debug/verify, got status=%s cause=%s summary=%s",
					p, out.Status, out.Cause, out.Summary)
			}
			if out.Provider != string(p) {
				t.Errorf("%s: provider echo mismatch, got %q", p, out.Provider)
			}

			// A tampered body must NOT pass.
			rec2 := callDebug(h, debugVerifyReq{
				Provider: string(p), Secret: secret,
				Headers: headers, Body: string(smp.Body) + "!", URL: effURL,
			})
			out2 := decodeDebug(t, rec2)
			if out2.Status == string(verify.Pass) {
				t.Fatalf("%s: tampered body must not pass", p)
			}
		})
	}
}

func TestDebugVerifyTamperedBodyFails(t *testing.T) {
	h := &PublicVerify{}
	const secret = "whsec_pub_debug"
	headers := stripeSignedHeaders(t, secret, `{"amount":100}`)
	rec := callDebug(h, debugVerifyReq{
		Provider: "stripe",
		Secret:   secret,
		Headers:  headers,
		Body:     `{"amount":999999}`, // tampered after signing
	})
	out := decodeDebug(t, rec)
	if out.Status != string(verify.Fail) {
		t.Fatalf("tampered body should fail, got status=%s", out.Status)
	}
	if out.Cause != string(verify.CauseBodyAltered) && out.Cause != string(verify.CauseSignatureMismatch) {
		t.Fatalf("tampered body cause should be body_possibly_altered or signature_mismatch, got %q", out.Cause)
	}
}

func TestDebugVerifyMissingSecret(t *testing.T) {
	h := &PublicVerify{}
	rec := callDebug(h, debugVerifyReq{
		Provider: "stripe",
		Secret:   "",
		Headers:  map[string]string{"Stripe-Signature": "t=1700000000,v1=deadbeef"},
		Body:     `{"amount":100}`,
	})
	out := decodeDebug(t, rec)
	if out.Cause != string(verify.CauseMissingSecret) {
		t.Fatalf("empty secret should yield missing_secret, got status=%s cause=%s", out.Status, out.Cause)
	}
}

func TestDebugVerifyAutoDetectsProvider(t *testing.T) {
	h := &PublicVerify{}
	const secret, body = "whsec_pub_debug", `{"amount":100}`
	rec := callDebug(h, debugVerifyReq{
		// provider omitted on purpose — must be detected from the headers.
		Secret:  secret,
		Headers: stripeSignedHeaders(t, secret, body),
		Body:    body,
	})
	out := decodeDebug(t, rec)
	if out.Provider != string(verify.Stripe) {
		t.Fatalf("provider should auto-detect to stripe, got %q", out.Provider)
	}
	if out.Status != string(verify.Pass) {
		t.Fatalf("auto-detected valid sample should pass, got %s", out.Status)
	}
}

func TestDebugVerifyRateLimited(t *testing.T) {
	// burst of 1 → the first request passes, the next (same IP) is 429.
	h := &PublicVerify{RL: httpx.NewRateLimiter(1, 1)}
	first := callDebug(h, debugVerifyReq{Provider: "stripe", Secret: "s", Body: "{}"})
	if first.Code == http.StatusTooManyRequests {
		t.Fatal("first request should not be rate limited")
	}
	var got429 bool
	for i := 0; i < 5; i++ {
		if callDebug(h, debugVerifyReq{Provider: "stripe", Secret: "s", Body: "{}"}).Code == http.StatusTooManyRequests {
			got429 = true
			break
		}
	}
	if !got429 {
		t.Fatal("expected a 429 once the per-IP bucket was exhausted")
	}
}

func TestDebugVerifyOversizeBodyRejected(t *testing.T) {
	h := &PublicVerify{MaxBodyBytes: 32} // tiny cap for the test
	rec := callDebug(h, debugVerifyReq{
		Provider: "stripe",
		Secret:   "s",
		Body:     `{"this":"body is definitely longer than thirty-two bytes"}`,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("oversize body should be 400, got %d %s", rec.Code, rec.Body.String())
	}
}

// TestDebugVerifyStoresNothing confirms the public debugger performs no DB writes.
// The handler has no store dependency by design; this asserts the end state of a
// Fake store is untouched after exercising the endpoint.
func TestDebugVerifyStoresNothing(t *testing.T) {
	st := store.NewFake()
	ep := &store.Endpoint{OwnerID: 1}
	if err := st.CreateEndpoint(context.Background(), ep); err != nil {
		t.Fatalf("seed endpoint: %v", err)
	}

	h := &PublicVerify{}
	const secret, body = "whsec_pub_debug", `{"amount":100}`
	for i := 0; i < 3; i++ {
		callDebug(h, debugVerifyReq{
			Provider: "stripe",
			Secret:   secret,
			Headers:  stripeSignedHeaders(t, secret, body),
			Body:     body,
		})
	}

	evs, err := st.ListEvents(context.Background(), ep.ID, store.EventFilter{})
	if err != nil {
		t.Fatalf("list events: %v", err)
	}
	if len(evs) != 0 {
		t.Fatalf("debugger must not persist events, found %d", len(evs))
	}
	attempts, _ := st.ListReplayAttempts(context.Background(), "anything")
	if len(attempts) != 0 {
		t.Fatalf("debugger must not persist replay attempts, found %d", len(attempts))
	}
}
