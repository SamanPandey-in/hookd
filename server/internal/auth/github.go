package auth

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"

	"whook/internal/httpx"
	"whook/internal/store"
)

// GitHubUser is the subset of a GitHub profile we persist.
type GitHubUser struct {
	ID        int64
	Login     string
	Email     string
	AvatarURL string
	Name      string
}

// OAuthProvider abstracts the GitHub OAuth dance so the handlers can be unit
// tested with a fake (no live GitHub creds needed).
type OAuthProvider interface {
	// AuthCodeURL returns the GitHub URL to redirect the user to, carrying state.
	AuthCodeURL(state string) string
	// Exchange swaps an authorization code for the authenticated GitHub user.
	Exchange(ctx context.Context, code string) (GitHubUser, error)
}

// liveGitHub is the real OAuthProvider backed by golang.org/x/oauth2.
type liveGitHub struct {
	cfg *oauth2.Config
	hc  *http.Client
}

// NewLiveGitHub builds a live GitHub OAuth provider.
func NewLiveGitHub(clientID, clientSecret, callbackURL string) OAuthProvider {
	return &liveGitHub{
		cfg: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  callbackURL,
			Scopes:       []string{"read:user", "user:email"},
			Endpoint:     github.Endpoint,
		},
		hc: &http.Client{Timeout: 10 * time.Second},
	}
}

func (g *liveGitHub) AuthCodeURL(state string) string {
	return g.cfg.AuthCodeURL(state, oauth2.AccessTypeOnline)
}

func (g *liveGitHub) Exchange(ctx context.Context, code string) (GitHubUser, error) {
	tok, err := g.cfg.Exchange(ctx, code)
	if err != nil {
		return GitHubUser{}, fmt.Errorf("auth: code exchange: %w", err)
	}
	client := g.cfg.Client(ctx, tok)
	client.Timeout = 10 * time.Second

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := client.Do(req)
	if err != nil {
		return GitHubUser{}, fmt.Errorf("auth: fetch github user: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return GitHubUser{}, fmt.Errorf("auth: github /user returned %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var profile struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Email     string `json:"email"`
		AvatarURL string `json:"avatar_url"`
		Name      string `json:"name"`
	}
	if err := json.Unmarshal(body, &profile); err != nil {
		return GitHubUser{}, fmt.Errorf("auth: parse github user: %w", err)
	}
	return GitHubUser{
		ID: profile.ID, Login: profile.Login, Email: profile.Email,
		AvatarURL: profile.AvatarURL, Name: profile.Name,
	}, nil
}

// Handlers wires the OAuth endpoints and the require-auth middleware.
type Handlers struct {
	provider OAuthProvider
	sessions *Sessions
	store    store.Store
	appURL   string // where to send the user after login (frontend app)
	secure   bool
	domain   string // optional parent domain for the short-lived state cookie
}

// NewHandlers builds auth handlers. appURL is the frontend URL to redirect to
// after a successful login. domain optionally scopes the OAuth state cookie to a
// parent domain (matches the session cookie); "" means a host-only cookie.
func NewHandlers(provider OAuthProvider, sessions *Sessions, st store.Store, appURL string, secure bool, domain string) *Handlers {
	return &Handlers{provider: provider, sessions: sessions, store: st, appURL: appURL, secure: secure, domain: domain}
}

// Login starts the OAuth flow: it mints a random state, stores it in a cookie
// (CSRF defense), and redirects to GitHub.
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	if h.provider == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "github oauth not configured")
		return
	}
	state := store.NewToken(16)
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookie,
		Value:    state,
		Path:     "/",
		Domain:   h.domain,
		MaxAge:   int((10 * time.Minute).Seconds()),
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, h.provider.AuthCodeURL(state), http.StatusFound)
}

// Callback completes the OAuth flow: it checks the state cookie against the
// query param (constant-time), exchanges the code, upserts the user, mints a
// session, and redirects to the app.
func (h *Handlers) Callback(w http.ResponseWriter, r *http.Request) {
	if h.provider == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "github oauth not configured")
		return
	}
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		httpx.Error(w, http.StatusUnauthorized, "github authorization denied")
		return
	}
	stateCookieVal, err := r.Cookie(stateCookie)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "missing oauth state cookie")
		return
	}
	// Always clear the state cookie once consumed.
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: "", Path: "/", Domain: h.domain, MaxAge: -1, HttpOnly: true, Secure: h.secure, SameSite: http.SameSiteLaxMode})

	queryState := r.URL.Query().Get("state")
	if queryState == "" || subtle.ConstantTimeCompare([]byte(queryState), []byte(stateCookieVal.Value)) != 1 {
		httpx.Error(w, http.StatusBadRequest, "oauth state mismatch (possible CSRF)")
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		httpx.Error(w, http.StatusBadRequest, "missing oauth code")
		return
	}

	ghUser, err := h.provider.Exchange(r.Context(), code)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "github exchange failed")
		return
	}
	u, err := h.store.UpsertUserByGitHub(r.Context(), ghUser.ID, ghUser.Login, ghUser.Email)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create account")
		return
	}
	// Persist display profile captured from GitHub (best-effort: never block login).
	_ = h.store.UpdateUserProfile(r.Context(), u.ID, ghUser.AvatarURL, ghUser.Name)
	// Record the login in the activity log (best-effort).
	_ = h.store.InsertActivity(r.Context(), &store.Activity{
		UserID: u.ID, Action: "login", Target: u.Login,
	})
	h.sessions.SetCookie(w, u.ID)
	redirect := h.appURL
	if redirect == "" {
		redirect = "/"
	}
	http.Redirect(w, r, redirect, http.StatusFound)
}

// Logout clears the session cookie.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	h.sessions.Clear(w)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

// Me returns the current authenticated user (for the frontend to bootstrap),
// including plan + subscription state so the UI can gate Pro features. The
// subscription object is null for free users (no live subscription).
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	uid := httpx.UserID(r.Context())
	u, err := h.store.GetUser(r.Context(), uid)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	userPlan := u.Plan
	if userPlan == "" {
		userPlan = "free"
	}
	var subscription any // null unless there is a live subscription
	if u.Subscription.Status != "" {
		subscription = map[string]any{
			"status":               u.Subscription.Status,
			"current_period_end":   u.Subscription.CurrentPeriodEnd,
			"cancel_at_period_end": u.Subscription.CancelAtPeriodEnd,
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"id": u.ID, "login": u.Login, "email": u.Email,
		"avatar_url": u.AvatarURL, "name": u.Name,
		"created_at_ms": u.CreatedAt.UnixMilli(),
		"plan":          userPlan, "subscription": subscription,
	})
}

// RequireAuth is middleware that rejects requests without a valid session and
// otherwise stores the user id on the request context.
func (h *Handlers) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid, err := h.sessions.FromRequest(r)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "authentication required")
			return
		}
		next.ServeHTTP(w, r.WithContext(httpx.WithUserID(r.Context(), uid)))
	})
}

// APIKeyResolver resolves a raw API key (e.g. "whk_…") to the owning user id.
// It returns an error when the key is absent, malformed, or unknown.
type APIKeyResolver func(ctx context.Context, rawKey string) (userID int64, err error)

// AuthSessionOrKey is middleware for programmatic routes: it accepts a valid
// session cookie OR, as an alternative, a whk_ API key presented via
// "Authorization: Bearer whk_…" or "X-API-Key: whk_…". The session is tried
// first so browser clients are unaffected. On success the resolved user id is
// stored on the context exactly as RequireAuth does.
func (h *Handlers) AuthSessionOrKey(resolve APIKeyResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if uid, err := h.sessions.FromRequest(r); err == nil {
				next.ServeHTTP(w, r.WithContext(httpx.WithUserID(r.Context(), uid)))
				return
			}
			if raw := apiKeyFromRequest(r); raw != "" && resolve != nil {
				if uid, err := resolve(r.Context(), raw); err == nil && uid > 0 {
					next.ServeHTTP(w, r.WithContext(httpx.WithUserID(r.Context(), uid)))
					return
				}
			}
			httpx.Error(w, http.StatusUnauthorized, "authentication required")
		})
	}
}

// apiKeyFromRequest extracts a bearer/API-key credential from the standard
// headers. It returns "" when neither is present.
func apiKeyFromRequest(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		if rest, ok := strings.CutPrefix(h, "Bearer "); ok {
			return strings.TrimSpace(rest)
		}
	}
	return strings.TrimSpace(r.Header.Get("X-API-Key"))
}
