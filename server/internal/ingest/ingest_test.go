package ingest

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"whook/internal/cryptox"
	"whook/internal/httpx"
	"whook/internal/sse"
	"whook/internal/store"
)

func testHandler(t *testing.T) (*Handler, *store.Fake, *sse.Hub) {
	t.Helper()
	st := store.NewFake()
	hub := sse.NewHub()
	cipher, err := cryptox.New([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatal(err)
	}
	// Generous limits so tests don't trip the limiter.
	epRL := httpx.NewRateLimiter(100000, 1000)
	ipRL := httpx.NewRateLimiter(100000, 1000)
	return New(st, hub, cipher, 1<<20, epRL, ipRL), st, hub
}

func router(h *Handler) http.Handler {
	r := chi.NewRouter()
	r.Handle("/i/{endpointID}", http.HandlerFunc(h.Capture))
	return r
}

func TestCaptureStoresExactBodyAndMeta(t *testing.T) {
	h, st, _ := testHandler(t)
	ep := &store.Endpoint{OwnerID: 1, Name: "test"}
	if err := st.CreateEndpoint(context.Background(), ep); err != nil {
		t.Fatal(err)
	}

	body := `{"amount":  2000,"weird":"  spaces  "}`
	req := httptest.NewRequest(http.MethodPost, "/i/"+ep.ID+"?foo=bar", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Add("X-Custom", "one")
	req.Header.Add("X-Custom", "two") // duplicate preserved
	rec := httptest.NewRecorder()
	router(h).ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("default response should be 200, got %d", rec.Code)
	}
	if strings.TrimSpace(rec.Body.String()) != "{}" {
		t.Fatalf("default body should be {}, got %q", rec.Body.String())
	}

	evs, _ := st.ListEvents(context.Background(), ep.ID, store.EventFilter{})
	if len(evs) != 1 {
		t.Fatalf("expected 1 stored event, got %d", len(evs))
	}
	ev := evs[0]
	if string(ev.RawBody) != body {
		t.Errorf("body not byte-exact: got %q", ev.RawBody)
	}
	if ev.Query != "foo=bar" {
		t.Errorf("query not captured: %q", ev.Query)
	}
	if ev.ContentType != "application/json" {
		t.Errorf("content type not captured: %q", ev.ContentType)
	}
	// Duplicate header values preserved.
	var custom []string
	for _, hp := range ev.Headers {
		if hp.Name == "X-Custom" {
			custom = append(custom, hp.Value)
		}
	}
	if len(custom) != 2 || custom[0] != "one" || custom[1] != "two" {
		t.Errorf("duplicate headers not preserved in order: %v", custom)
	}
	if ev.ReceivedAtMS == 0 {
		t.Error("received_at_ms not set")
	}
}

// TestCaptureTwilioVerifiesWithForwardedURL proves the capture path reconstructs
// the external URL from X-Forwarded-Proto/Host and verifies a URL-bound Twilio
// signature as PASS — the whole point of threading the URL into the engine.
func TestCaptureTwilioVerifiesWithForwardedURL(t *testing.T) {
	h, st, _ := testHandler(t)
	ep := &store.Endpoint{OwnerID: 1, Provider: "twilio"}
	if err := st.CreateEndpoint(context.Background(), ep); err != nil {
		t.Fatal(err)
	}
	const token = "twilio_auth_token_sample"
	enc, err := h.cipher.EncryptString(token)
	if err != nil {
		t.Fatal(err)
	}
	if err := st.SetEndpointSecret(context.Background(), ep.ID, enc, "tw…"); err != nil {
		t.Fatal(err)
	}

	// The URL the handler will reconstruct from the forwarded headers.
	fullURL := "https://api.hookd.dev/i/" + ep.ID
	body := "A=1&B=2&MessageSid=SM0001"
	// Independent expected signature: URL + sorted(key+value), HMAC-SHA1 base64.
	data := fullURL + "A1B2MessageSidSM0001"
	mac := hmac.New(sha1.New, []byte(token))
	mac.Write([]byte(data))
	sig := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	req := httptest.NewRequest(http.MethodPost, "/i/"+ep.ID, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "api.hookd.dev")
	req.Header.Set("X-Twilio-Signature", sig)
	rec := httptest.NewRecorder()
	router(h).ServeHTTP(rec, req)

	evs, _ := st.ListEvents(context.Background(), ep.ID, store.EventFilter{})
	if len(evs) != 1 {
		t.Fatalf("expected 1 stored event, got %d", len(evs))
	}
	if evs[0].VerifyStatus != "pass" {
		t.Fatalf("Twilio capture should verify PASS, got status=%q cause=%q summary=%q",
			evs[0].VerifyStatus, evs[0].VerifyCause, evs[0].VerifySummary)
	}
}

func TestCaptureUnknownEndpoint404(t *testing.T) {
	h, _, _ := testHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/i/doesnotexist", strings.NewReader("x"))
	rec := httptest.NewRecorder()
	router(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown endpoint should be 404, got %d", rec.Code)
	}
}

func TestCaptureRespectsResponseRule(t *testing.T) {
	h, st, _ := testHandler(t)
	ep := &store.Endpoint{OwnerID: 1, Response: store.ResponseRule{
		Status: 500, Headers: map[string]string{"X-Test": "yes"}, Body: `{"err":"boom"}`,
	}}
	_ = st.CreateEndpoint(context.Background(), ep)

	req := httptest.NewRequest(http.MethodPost, "/i/"+ep.ID, strings.NewReader("{}"))
	rec := httptest.NewRecorder()
	router(h).ServeHTTP(rec, req)

	if rec.Code != 500 {
		t.Fatalf("expected configured status 500, got %d", rec.Code)
	}
	if rec.Header().Get("X-Test") != "yes" {
		t.Error("configured response header missing")
	}
	if strings.TrimSpace(rec.Body.String()) != `{"err":"boom"}` {
		t.Errorf("configured body missing, got %q", rec.Body.String())
	}
}

func TestCaptureBodyTooLarge(t *testing.T) {
	h, st, _ := testHandler(t)
	h.maxBody = 10 // tiny cap
	ep := &store.Endpoint{OwnerID: 1}
	_ = st.CreateEndpoint(context.Background(), ep)

	req := httptest.NewRequest(http.MethodPost, "/i/"+ep.ID, strings.NewReader(strings.Repeat("x", 1000)))
	rec := httptest.NewRecorder()
	router(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body should be 413, got %d", rec.Code)
	}
}

// TestIngestToSSEUnder1s is the demo-centerpiece guarantee: a webhook captured
// on ingest reaches a connected subscriber in well under a second.
func TestIngestToSSEUnder1s(t *testing.T) {
	h, st, hub := testHandler(t)
	ep := &store.Endpoint{OwnerID: 1}
	_ = st.CreateEndpoint(context.Background(), ep)

	ch, unsub := hub.Subscribe(ep.ID)
	defer unsub()

	start := time.Now()
	req := httptest.NewRequest(http.MethodPost, "/i/"+ep.ID, strings.NewReader(`{"live":true}`))
	rec := httptest.NewRecorder()
	go router(h).ServeHTTP(rec, req)

	select {
	case msg := <-ch:
		if elapsed := time.Since(start); elapsed > time.Second {
			t.Fatalf("ingest->SSE took %s (>1s)", elapsed)
		}
		if !strings.Contains(msg.Data, `"endpoint_id"`) {
			t.Errorf("SSE payload missing fields: %q", msg.Data)
		}
	case <-time.After(time.Second):
		t.Fatal("event did not reach SSE subscriber within 1s")
	}
}

func TestDeriveEventType(t *testing.T) {
	cases := []struct {
		name    string
		headers map[string]string
		ct      string
		body    string
		want    string
	}{
		{
			name: "json top-level type (stripe/standard-webhooks)",
			ct:   "application/json",
			body: `{"id":"evt_1","type":"checkout.session.completed","data":{}}`,
			want: "checkout.session.completed",
		},
		{
			name:    "json wins over headers",
			headers: map[string]string{"X-GitHub-Event": "push"},
			ct:      "application/json",
			body:    `{"type":"payment_intent.succeeded"}`,
			want:    "payment_intent.succeeded",
		},
		{
			name:    "github header",
			headers: map[string]string{"X-GitHub-Event": "push"},
			body:    `not json`,
			want:    "push",
		},
		{
			name:    "shopify header",
			headers: map[string]string{"X-Shopify-Topic": "orders/create"},
			body:    ``,
			want:    "orders/create",
		},
		{
			name:    "x-event-name header",
			headers: map[string]string{"X-Event-Name": "invoice.paid"},
			body:    `{}`,
			want:    "invoice.paid",
		},
		{
			name:    "x-event-type header",
			headers: map[string]string{"X-Event-Type": "subscription.updated"},
			body:    `{}`,
			want:    "subscription.updated",
		},
		{
			name:    "github preferred over shopify",
			headers: map[string]string{"X-GitHub-Event": "push", "X-Shopify-Topic": "orders/create"},
			want:    "push",
		},
		{
			name: "empty / non-json body, no headers",
			body: `hello world`,
			want: "",
		},
		{
			name: "json without type field",
			ct:   "application/json",
			body: `{"event":"payment.captured"}`,
			want: "",
		},
		{
			name: "non-string type is ignored",
			ct:   "application/json",
			body: `{"type":123}`,
			want: "",
		},
		{
			name: "control chars and newlines stripped",
			ct:   "application/json",
			body: "{\"type\":\"foo\\nbar\\u0000baz\"}",
			want: "foo barbaz",
		},
		{
			name: "oversized value capped to 120 bytes",
			ct:   "application/json",
			body: `{"type":"` + strings.Repeat("a", 200) + `"}`,
			want: strings.Repeat("a", 120),
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := http.Header{}
			for k, v := range tc.headers {
				h.Set(k, v)
			}
			got := deriveEventType(h, tc.ct, []byte(tc.body))
			if got != tc.want {
				t.Fatalf("deriveEventType = %q, want %q", got, tc.want)
			}
			if len(got) > maxEventTypeLen {
				t.Fatalf("result exceeds cap: %d bytes", len(got))
			}
		})
	}
}

func TestRateLimitPerEndpoint(t *testing.T) {
	st := store.NewFake()
	hub := sse.NewHub()
	cipher, _ := cryptox.New([]byte("0123456789abcdef0123456789abcdef"))
	// burst of 2, then blocked.
	epRL := httpx.NewRateLimiter(1, 2)
	ipRL := httpx.NewRateLimiter(100000, 100000)
	h := New(st, hub, cipher, 1<<20, epRL, ipRL)
	ep := &store.Endpoint{OwnerID: 1}
	_ = st.CreateEndpoint(context.Background(), ep)

	codes := make([]int, 0, 4)
	for i := 0; i < 4; i++ {
		req := httptest.NewRequest(http.MethodPost, "/i/"+ep.ID, strings.NewReader("{}"))
		rec := httptest.NewRecorder()
		router(h).ServeHTTP(rec, req)
		codes = append(codes, rec.Code)
	}
	blocked := 0
	for _, c := range codes {
		if c == http.StatusTooManyRequests {
			blocked++
		}
	}
	if blocked == 0 {
		t.Fatalf("expected some requests to be rate-limited, got codes %v", codes)
	}
}
