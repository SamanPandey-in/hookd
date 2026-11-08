package app

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"whook/internal/auth"
	"whook/internal/config"
	"whook/internal/cryptox"
	"whook/internal/replay"
	"whook/internal/sse"
	"whook/internal/store"
)

// buildTestServer wires the full app with a fake store and returns the server
// plus a session cookie for a given user id (minted with the same key the app
// uses, so the real RequireAuth middleware accepts it).
func buildTestServer(t *testing.T) (*httptest.Server, *store.Fake, *http.Cookie) {
	t.Helper()
	t.Setenv("DATABASE_URL", "")
	t.Setenv("SECRET_ENC_KEY", "")
	t.Setenv("SESSION_KEY", "")
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	st := store.NewFake()
	// Seed a user so /api/me works and uid=1 is real.
	u, _ := st.UpsertUserByGitHub(context.Background(), 777, "octocat", "o@x.com")

	cipher, _ := cryptox.New(cfg.SecretEncKey)
	h := New(Deps{
		Config: cfg,
		Store:  st,
		Cipher: cipher,
		Hub:    sse.NewHub(),
		Replay: replay.NewEngine(cfg.ReplayTimeout, cfg.MaxReplayRespBody),
		OAuth:  nil,
	})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)

	sessions := auth.NewSessions(cfg.SessionKey, cfg.CookieSecure, cfg.CookieSameSite, cfg.CookieDomain, 0)
	rec := httptest.NewRecorder()
	sessions.SetCookie(rec, u.ID)
	var cookie *http.Cookie
	for _, c := range rec.Result().Cookies() {
		cookie = c
	}
	if cookie == nil {
		t.Fatal("could not mint session cookie")
	}
	return srv, st, cookie
}

func TestEndToEndIngestToSSE(t *testing.T) {
	srv, _, cookie := buildTestServer(t)
	client := srv.Client()

	// Create an endpoint via the authed API.
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/endpoints",
		strings.NewReader(`{"name":"e2e","provider":"stripe"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var ep store.Endpoint
	_ = json.NewDecoder(resp.Body).Decode(&ep)
	resp.Body.Close()
	if ep.ID == "" {
		t.Fatal("no endpoint created")
	}

	// Open the authed SSE stream.
	streamReq, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/endpoints/"+ep.ID+"/stream", nil)
	streamReq.AddCookie(cookie)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	streamReq = streamReq.WithContext(ctx)
	streamResp, err := client.Do(streamReq)
	if err != nil {
		t.Fatal(err)
	}
	defer streamResp.Body.Close()
	if streamResp.StatusCode != 200 {
		t.Fatalf("stream status %d", streamResp.StatusCode)
	}

	reader := bufio.NewReader(streamResp.Body)
	// Read the initial ": connected" comment line so we know we're subscribed.
	if _, err := reader.ReadString('\n'); err != nil {
		t.Fatalf("read connect line: %v", err)
	}

	// Fire a webhook at the PUBLIC ingest URL (no auth) and time delivery.
	start := time.Now()
	ingReq, _ := http.NewRequest(http.MethodPost, srv.URL+"/i/"+ep.ID,
		bytes.NewReader([]byte(`{"event":"live"}`)))
	ingReq.Header.Set("Content-Type", "application/json")
	ingResp, err := client.Do(ingReq)
	if err != nil {
		t.Fatal(err)
	}
	ingResp.Body.Close()

	// Read SSE lines until we get a data: line.
	got := make(chan string, 1)
	go func() {
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			if strings.HasPrefix(line, "data: ") {
				got <- strings.TrimSpace(strings.TrimPrefix(line, "data: "))
				return
			}
		}
	}()

	select {
	case data := <-got:
		elapsed := time.Since(start)
		if elapsed > time.Second {
			t.Fatalf("ingest->SSE took %s (>1s)", elapsed)
		}
		if !strings.Contains(data, `"endpoint_id"`) || !strings.Contains(data, ep.ID) {
			t.Fatalf("unexpected SSE payload: %s", data)
		}
		t.Logf("ingest->SSE delivered in %s: %s", elapsed, data)
	case <-time.After(2 * time.Second):
		t.Fatal("did not receive SSE event within 2s of ingest")
	}
}

func TestMeIncludesPlanAndSubscription(t *testing.T) {
	srv, st, cookie := buildTestServer(t)
	client := srv.Client()

	me := func() map[string]any {
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/me", nil)
		req.AddCookie(cookie)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			t.Fatalf("/api/me: %d", resp.StatusCode)
		}
		var m map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&m)
		return m
	}

	// Fresh user: free plan, null subscription.
	m := me()
	if m["plan"] != "free" {
		t.Fatalf("new user plan should be free, got %v", m["plan"])
	}
	if m["subscription"] != nil {
		t.Fatalf("free user subscription should be null, got %v", m["subscription"])
	}

	// Upgrade to Pro with a live subscription.
	u, _ := st.UpsertUserByGitHub(context.Background(), 777, "octocat", "o@x.com")
	_ = st.UpdateUserSubscription(context.Background(), u.ID, "pro",
		store.Subscription{Status: "active", CurrentPeriodEnd: 1764720000000, CancelAtPeriodEnd: false})

	m = me()
	if m["plan"] != "pro" {
		t.Fatalf("plan should be pro, got %v", m["plan"])
	}
	sub, ok := m["subscription"].(map[string]any)
	if !ok {
		t.Fatalf("subscription should be an object, got %v", m["subscription"])
	}
	if sub["status"] != "active" {
		t.Fatalf("subscription status should be active, got %v", sub["status"])
	}
	if _, ok := sub["current_period_end"]; !ok {
		t.Fatal("subscription must include current_period_end")
	}
	if _, ok := sub["cancel_at_period_end"]; !ok {
		t.Fatal("subscription must include cancel_at_period_end")
	}
}

func TestMeIncludesProfileFields(t *testing.T) {
	srv, st, cookie := buildTestServer(t)
	client := srv.Client()

	// Persist a profile as the OAuth callback would.
	u, _ := st.UpsertUserByGitHub(context.Background(), 777, "octocat", "o@x.com")
	_ = st.UpdateUserProfile(context.Background(), u.ID, "https://avatars.example/x.png", "Octo Cat")

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/me", nil)
	req.AddCookie(cookie)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var m map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&m)

	if m["avatar_url"] != "https://avatars.example/x.png" {
		t.Fatalf("avatar_url missing/wrong: %v", m["avatar_url"])
	}
	if m["name"] != "Octo Cat" {
		t.Fatalf("name missing/wrong: %v", m["name"])
	}
	if m["email"] != "o@x.com" {
		t.Fatalf("email missing/wrong: %v", m["email"])
	}
	if _, ok := m["created_at_ms"]; !ok {
		t.Fatal("created_at_ms missing")
	}
}

func TestMeIncludesThemeAndThemeSync(t *testing.T) {
	srv, st, cookie := buildTestServer(t)
	client := srv.Client()

	me := func() map[string]any {
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/me", nil)
		req.AddCookie(cookie)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var m map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&m)
		return m
	}

	// Fresh user: theme is present and empty (no account preference yet).
	m := me()
	if v, ok := m["theme"]; !ok || v != "" {
		t.Fatalf("/api/me must include an (empty) theme, got %v ok=%v", m["theme"], ok)
	}

	// Set the theme via the account endpoint.
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/account/theme",
		strings.NewReader(`{"theme":"mono-dark"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/account/theme: %d", resp.StatusCode)
	}

	if m = me(); m["theme"] != "mono-dark" {
		t.Fatalf("/api/me should reflect the synced theme, got %v", m["theme"])
	}
	// And it is persisted on the user row.
	u, _ := st.UpsertUserByGitHub(context.Background(), 777, "octocat", "o@x.com")
	if got, _ := st.GetUser(context.Background(), u.ID); got.Theme != "mono-dark" {
		t.Fatalf("theme not persisted on the user row, got %q", got.Theme)
	}
}

func TestAPIKeyAuthOnProgrammaticRoute(t *testing.T) {
	srv, _, cookie := buildTestServer(t)
	client := srv.Client()

	// Create a key (session-authed).
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/keys",
		strings.NewReader(`{"name":"cli"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var created map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&created)
	resp.Body.Close()
	fullKey, _ := created["key"].(string)
	keyID, _ := created["id"].(string)
	if fullKey == "" || keyID == "" {
		t.Fatal("key create did not return key+id")
	}

	// List is masked (no full key).
	req, _ = http.NewRequest(http.MethodGet, srv.URL+"/api/keys", nil)
	req.AddCookie(cookie)
	resp, _ = client.Do(req)
	body := make([]byte, 4096)
	n, _ := resp.Body.Read(body)
	resp.Body.Close()
	if strings.Contains(string(body[:n]), fullKey) {
		t.Fatal("key list leaked the full key")
	}

	// The key authenticates a programmatic route WITHOUT a session cookie.
	callEndpoints := func(useKey bool) int {
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/endpoints", nil)
		if useKey {
			req.Header.Set("Authorization", "Bearer "+fullKey)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if code := callEndpoints(true); code != http.StatusOK {
		t.Fatalf("api key should authenticate GET /api/endpoints, got %d", code)
	}
	// No credentials at all -> 401.
	if code := callEndpoints(false); code != http.StatusUnauthorized {
		t.Fatalf("no-auth GET /api/endpoints must be 401, got %d", code)
	}

	// Revoke the key (session-authed) -> 204.
	req, _ = http.NewRequest(http.MethodDelete, srv.URL+"/api/keys/"+keyID, nil)
	req.AddCookie(cookie)
	resp, _ = client.Do(req)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("revoke must be 204, got %d", resp.StatusCode)
	}

	// Revoked key no longer authenticates.
	if code := callEndpoints(true); code != http.StatusUnauthorized {
		t.Fatalf("revoked key must be rejected (401), got %d", code)
	}
}

func TestIngestUnauthedButAPIProtected(t *testing.T) {
	srv, _, _ := buildTestServer(t)
	client := srv.Client()

	// /api without a session -> 401.
	resp, err := client.Get(srv.URL + "/api/endpoints")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthed /api must be 401, got %d", resp.StatusCode)
	}

	// /healthz public.
	resp, _ = client.Get(srv.URL + "/healthz")
	if resp.StatusCode != 200 {
		t.Fatalf("healthz should be 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}
