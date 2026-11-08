// Package app assembles the HTTP handler from all the pieces (config, store,
// crypto, hub, ingest, auth, api, replay) so both cmd/server and tests build the
// server the same way.
package app

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"whook/internal/api"
	"whook/internal/auth"
	"whook/internal/config"
	"whook/internal/cryptox"
	"whook/internal/dodo"
	"whook/internal/email"
	"whook/internal/httpx"
	"whook/internal/ingest"
	"whook/internal/replay"
	"whook/internal/sse"
	"whook/internal/store"
)

// Deps are the already-constructed collaborators the router needs. Building them
// separately keeps tests able to inject a Fake store and a fake OAuth provider.
type Deps struct {
	Config *config.Config
	Store  store.Store
	Cipher *cryptox.Cipher
	Hub    *sse.Hub
	Replay *replay.Engine
	OAuth  auth.OAuthProvider // may be nil if GitHub not configured
	Dodo   dodo.Client        // may be nil if Dodo not configured (billing fails soft)
}

// New builds the full HTTP handler.
func New(d Deps) http.Handler {
	cfg := d.Config

	endpointRL := httpx.NewRateLimiter(cfg.IngestRatePerMin, cfg.IngestBurst)
	ipRL := httpx.NewRateLimiter(cfg.IPRatePerMin, cfg.IPBurst)
	// Dedicated per-IP bucket for the public (unauth) signature debugger, kept
	// separate from the ingest limiters so debugger traffic can't starve ingest.
	debugRL := httpx.NewRateLimiter(cfg.IPRatePerMin, cfg.IPBurst)

	ingestH := ingest.New(d.Store, d.Hub, d.Cipher, cfg.MaxBodyBytes, endpointRL, ipRL)

	sessions := auth.NewSessions(cfg.SessionKey, cfg.CookieSecure, cfg.CookieSameSite, cfg.CookieDomain, 0)
	authH := auth.NewHandlers(d.OAuth, sessions, d.Store, cfg.AllowedOrigin, cfg.CookieSecure, cfg.CookieDomain)

	apiH := &api.API{
		Store:       d.Store,
		Hub:         d.Hub,
		Cipher:      d.Cipher,
		Replay:      d.Replay,
		MaxJSONBody: 1 << 20,
	}
	// Per-route auth: session cookie for management routes, session-or-API-key
	// for the programmatic read/write routes.
	apiH.AuthSession = authH.RequireAuth
	apiH.AuthSessionOrKey = authH.AuthSessionOrKey(apiH.ResolveAPIKey)

	// Transactional email sender. Inert (no-op, "would send" log) unless SMTP is
	// configured — drop-in: set SMTP_* + EMAIL_FROM to enable real delivery.
	mailer := email.New(email.Config{
		Host:     cfg.SMTPHost,
		Port:     cfg.SMTPPort,
		Username: cfg.SMTPUsername,
		Password: cfg.SMTPPassword,
		From:     cfg.EmailFrom,
	})

	billingH := &api.Billing{
		Store:          d.Store,
		Dodo:           d.Dodo,
		Email:          mailer,
		MaxJSONBody:    1 << 20,
		WebhookSecret:  cfg.DodoWebhookSecret,
		ProductMonthly: cfg.DodoProductMonthly,
		ProductAnnual:  cfg.DodoProductAnnual,
		SuccessURL:     cfg.DodoSuccessURL,
		CancelURL:      cfg.DodoCancelURL,
	}

	r := chi.NewRouter()
	r.Use(httpx.Recover)
	r.Use(httpx.RequestIDAndLog)
	r.Use(httpx.CORS(cfg.AllowedOrigin))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Public, untrusted ingest path — all HTTP methods.
	r.Handle("/i/{endpointID}", http.HandlerFunc(ingestH.Capture))

	// Auth (public).
	r.Route("/auth", func(r chi.Router) {
		r.Get("/github/login", authH.Login)
		r.Get("/github/callback", authH.Callback)
		// Logout is cookie-authed and state-changing → same CSRF guard as /api.
		r.With(httpx.EnforceOrigin(cfg.AllowedOrigin)).Post("/logout", authH.Logout)
	})

	// Public read-only share link.
	r.Get("/share/{token}", apiH.Share)

	// Public, no-auth signature debugger (free top-of-funnel). Rate-limited per
	// IP, stores nothing, does no outbound I/O. CORS for the allowed origin is
	// already applied by the router-wide middleware above.
	publicVerifyH := &api.PublicVerify{RL: debugRL}
	r.Post("/debug/verify", publicVerifyH.Verify)

	// Public Dodo Payments webhook (verified via our own Standard-Webhooks engine).
	r.Post("/webhooks/dodo", billingH.Webhook)

	// Authed JSON API. Auth is applied per-route (Mount declares its own): most
	// routes are session-only, the four programmatic routes also accept API keys.
	r.Route("/api", func(r chi.Router) {
		// CSRF defense: cookie auth rides cross-site (SameSite=None), so reject
		// unsafe-method requests from a foreign Origin before any auth/work.
		r.Use(httpx.EnforceOrigin(cfg.AllowedOrigin))
		r.With(authH.RequireAuth).Get("/me", authH.Me)
		r.Route("/billing", func(r chi.Router) {
			r.Use(authH.RequireAuth)
			r.Post("/checkout", billingH.Checkout)
			r.Get("/portal", billingH.Portal)
		})
		apiH.Mount(r)
	})

	return r
}
