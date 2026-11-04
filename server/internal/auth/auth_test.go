package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"whook/internal/httpx"
	"whook/internal/store"
)

func newSessions() *Sessions {
	return NewSessions([]byte("test-session-signing-key-0123456789"), false, http.SameSiteLaxMode, "", time.Hour)
}

func TestSessionRoundTrip(t *testing.T) {
	s := newSessions()
	val := s.sign(42, time.Now().Add(time.Hour))
	id, err := s.Verify(val)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if id != 42 {
		t.Fatalf("got user id %d, want 42", id)
	}
}

func TestSessionTamperRejected(t *testing.T) {
	s := newSessions()
	val := s.sign(42, time.Now().Add(time.Hour))
	// Flip a char in the payload.
	bad := "x" + val[1:]
	if _, err := s.Verify(bad); err == nil {
		t.Fatal("tampered session must be rejected")
	}
	// Swap to a different signing key -> signature mismatch.
	other := NewSessions([]byte("a-totally-different-signing-key-9999"), false, http.SameSiteLaxMode, "", time.Hour)
	if _, err := other.Verify(val); err == nil {
		t.Fatal("session signed with another key must be rejected")
	}
}

func TestSessionExpired(t *testing.T) {
	s := newSessions()
	val := s.sign(7, time.Now().Add(-time.Minute))
	if _, err := s.Verify(val); err == nil {
		t.Fatal("expired session must be rejected")
	}
}

func TestSessionMalformed(t *testing.T) {
	s := newSessions()
	for _, v := range []string{"", "nodot", "a.b.c.d", "....", "notbase64.sig"} {
		if _, err := s.Verify(v); err == nil {
			t.Errorf("malformed %q should be rejected", v)
		}
	}
}

// fakeOAuth implements OAuthProvider for handler tests without live GitHub.
type fakeOAuth struct {
	user    GitHubUser
	lastURL string
}

func (f *fakeOAuth) AuthCodeURL(state string) string {
	f.lastURL = "https://github.test/authorize?state=" + state
	return f.lastURL
}
func (f *fakeOAuth) Exchange(_ context.Context, code string) (GitHubUser, error) {
	return f.user, nil
}

func TestLoginSetsStateCookieAndRedirects(t *testing.T) {
	st := store.NewFake()
	h := NewHandlers(&fakeOAuth{}, newSessions(), st, "http://localhost:3000", false, "")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/auth/github/login", nil)
	h.Login(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected redirect, got %d", rec.Code)
	}
	var state string
	for _, c := range rec.Result().Cookies() {
		if c.Name == stateCookie {
			state = c.Value
		}
	}
	if state == "" {
		t.Fatal("login must set a state cookie")
	}
	if !strings.Contains(rec.Header().Get("Location"), state) {
		t.Fatal("redirect URL must carry the same state as the cookie")
	}
}

func TestCallbackHappyPath(t *testing.T) {
	st := store.NewFake()
	h := NewHandlers(&fakeOAuth{user: GitHubUser{ID: 123, Login: "octocat", Email: "o@x.com"}},
		newSessions(), st, "http://localhost:3000", false, "")

	// Simulate the state cookie set during login.
	state := "state-token-123"
	req := httptest.NewRequest(http.MethodGet, "/auth/github/callback?state="+state+"&code=abc", nil)
	req.AddCookie(&http.Cookie{Name: stateCookie, Value: state})
	rec := httptest.NewRecorder()
	h.Callback(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected redirect after login, got %d: %s", rec.Code, rec.Body.String())
	}
	// Session cookie must be set.
	var sess string
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookie {
			sess = c.Value
		}
	}
	if sess == "" {
		t.Fatal("callback must set a session cookie")
	}
	// User must be persisted.
	if u, err := st.GetUser(context.Background(), 1); err != nil || u.GitHubID != 123 {
		t.Fatalf("user not upserted: %v", err)
	}
}

func TestCallbackStateMismatchRejected(t *testing.T) {
	st := store.NewFake()
	h := NewHandlers(&fakeOAuth{user: GitHubUser{ID: 1}}, newSessions(), st, "", false, "")

	req := httptest.NewRequest(http.MethodGet, "/auth/github/callback?state=attacker&code=abc", nil)
	req.AddCookie(&http.Cookie{Name: stateCookie, Value: "real-state"})
	rec := httptest.NewRecorder()
	h.Callback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("state mismatch must be rejected (CSRF), got %d", rec.Code)
	}
}

func TestCallbackMissingStateCookieRejected(t *testing.T) {
	st := store.NewFake()
	h := NewHandlers(&fakeOAuth{}, newSessions(), st, "", false, "")
	req := httptest.NewRequest(http.MethodGet, "/auth/github/callback?state=x&code=abc", nil)
	rec := httptest.NewRecorder()
	h.Callback(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("missing state cookie must be rejected, got %d", rec.Code)
	}
}

func TestRequireAuthMiddleware(t *testing.T) {
	s := newSessions()
	h := NewHandlers(&fakeOAuth{}, s, store.NewFake(), "", false, "")

	var sawUID int64
	protected := h.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawUID = httpx.UserID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	// No cookie -> 401.
	rec := httptest.NewRecorder()
	protected.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/endpoints", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing session must be 401, got %d", rec.Code)
	}

	// Valid cookie -> passes with uid on context.
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/endpoints", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: s.sign(99, time.Now().Add(time.Hour))})
	protected.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("valid session must pass, got %d", rec.Code)
	}
	if sawUID != 99 {
		t.Fatalf("user id not propagated: %d", sawUID)
	}
}
