package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientIPForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.9:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")
	if ip := ClientIP(req); ip != "203.0.113.5" {
		t.Fatalf("expected first XFF hop, got %q", ip)
	}
}

func TestClientIPRemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "198.51.100.7:5555"
	if ip := ClientIP(req); ip != "198.51.100.7" {
		t.Fatalf("expected RemoteAddr host, got %q", ip)
	}
}

func TestCORSAllowsConfiguredOrigin(t *testing.T) {
	h := CORS("https://app.example")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Allowed origin echoed.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://app.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "https://app.example" {
		t.Fatal("configured origin should be allowed")
	}

	// Disallowed origin not echoed.
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("unlisted origin must not be allowed")
	}

	// Preflight short-circuits.
	req = httptest.NewRequest(http.MethodOptions, "/", nil)
	req.Header.Set("Origin", "https://app.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS preflight should be 204, got %d", rec.Code)
	}
}

func TestRateLimiterBurstThenBlock(t *testing.T) {
	l := NewRateLimiter(1, 2) // burst 2
	k := "key"
	if !l.Allow(k) || !l.Allow(k) {
		t.Fatal("first two requests within burst should pass")
	}
	if l.Allow(k) {
		t.Fatal("third request should be limited")
	}
	// A different key has its own bucket.
	if !l.Allow("other") {
		t.Fatal("independent key should pass")
	}
}
