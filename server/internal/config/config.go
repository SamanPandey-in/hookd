// Package config loads and validates the server's runtime configuration from
// the environment. It fails fast with clear messages for anything that is
// required in production, while providing sane defaults for local development.
package config

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the fully-resolved server configuration.
type Config struct {
	Port          string
	BindAddr      string // interface to bind; "" = all. Set 127.0.0.1 behind a proxy.
	DatabaseURL   string
	AllowedOrigin string

	// SecretEncKey is the 32-byte AES-256 key used to encrypt signing secrets
	// at rest. Supplied as base64 (standard or raw) of exactly 32 bytes.
	SecretEncKey []byte

	// SessionKey signs session cookies (HMAC). Must be non-trivial in prod.
	SessionKey []byte

	GitHubClientID     string
	GitHubClientSecret string
	GitHubCallbackURL  string

	// Dodo Payments (billing). All optional — when DodoAPIKey is unset, billing
	// endpoints fail soft (503) and everyone stays on the free plan. See docs at
	// https://docs.dodopayments.com/developer-resources/checkout-session and
	// https://docs.dodopayments.com/developer-resources/webhooks .
	DodoAPIKey         string
	DodoWebhookSecret  string // Standard-Webhooks signing secret (whsec_…)
	DodoEnvironment    string // "test" | "live"
	DodoProductMonthly string // Dodo product id for the monthly Pro price
	DodoProductAnnual  string // Dodo product id for the annual Pro price
	DodoSuccessURL     string // return_url after a successful checkout
	DodoCancelURL      string // where the frontend sends a cancelled checkout

	// Caps.
	MaxBodyBytes      int64         // ingest body size cap (default 1MiB)
	IngestRatePerMin  int           // per-endpoint ingest rate (tokens/min)
	IngestBurst       int           // per-endpoint burst
	IPRatePerMin      int           // per-IP ingest rate (tokens/min)
	IPBurst           int           // per-IP burst
	ReplayTimeout     time.Duration // per replay attempt timeout
	MaxReplayRespBody int64         // cap on stored replay response body

	// CookieSecure controls the Secure flag on session cookies; off for local
	// http, on when served behind TLS.
	CookieSecure bool

	// CookieSameSite controls the SameSite attribute on the session cookie. A
	// cross-site deploy — frontend and API on different registrable domains, e.g.
	// a Vercel app calling an EC2 API — must use None, or the browser drops the
	// cookie on every credentialed fetch and the app looks logged-out. Browsers
	// only honor None together with Secure. Same-site deploys keep Lax.
	CookieSameSite http.SameSite

	// CookieDomain optionally scopes the auth cookies to a parent domain so they
	// are shared across subdomains (e.g. ".hookd.dev" to let app.hookd.dev and
	// api.hookd.dev share a session with SameSite=Lax). Empty = host-only cookie.
	CookieDomain string

	// Dev is true when running with local defaults (no DATABASE_URL etc.).
	Dev bool
}

// Load reads configuration from the environment. If strict is false (local
// dev), missing production-only values get development defaults and only truly
// unusable values error. If strict is true, every production requirement must
// be satisfied.
func Load() (*Config, error) {
	// Local-dev convenience: pick up an adjacent .env (never overrides real env).
	loadDotEnv(".env")

	c := &Config{
		Port:               envOr("PORT", "8080"),
		BindAddr:           strings.TrimSpace(os.Getenv("BIND_ADDR")),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		AllowedOrigin:      envOr("ALLOWED_ORIGIN", "http://localhost:3000"),
		GitHubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		GitHubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		GitHubCallbackURL:  envOr("GITHUB_CALLBACK_URL", "http://localhost:8080/auth/github/callback"),

		DodoAPIKey:         os.Getenv("DODO_API_KEY"),
		DodoWebhookSecret:  os.Getenv("DODO_WEBHOOK_SECRET"),
		DodoEnvironment:    envOr("DODO_ENVIRONMENT", "test"),
		DodoProductMonthly: os.Getenv("DODO_PRODUCT_ID_MONTHLY"),
		DodoProductAnnual:  os.Getenv("DODO_PRODUCT_ID_ANNUAL"),
		DodoSuccessURL:     envOr("DODO_SUCCESS_URL", "http://localhost:3000/app?billing=success"),
		DodoCancelURL:      envOr("DODO_CANCEL_URL", "http://localhost:3000/app?billing=cancelled"),
	}

	var err error
	if c.MaxBodyBytes, err = envInt64("MAX_BODY_BYTES", 1<<20); err != nil {
		return nil, err
	}
	if c.IngestRatePerMin, err = envInt("INGEST_RATE_PER_MIN", 120); err != nil {
		return nil, err
	}
	if c.IngestBurst, err = envInt("INGEST_BURST", 40); err != nil {
		return nil, err
	}
	if c.IPRatePerMin, err = envInt("IP_RATE_PER_MIN", 300); err != nil {
		return nil, err
	}
	if c.IPBurst, err = envInt("IP_BURST", 100); err != nil {
		return nil, err
	}
	if c.MaxReplayRespBody, err = envInt64("MAX_REPLAY_RESP_BODY", 256<<10); err != nil {
		return nil, err
	}
	secs, err := envInt("REPLAY_TIMEOUT_SECONDS", 10)
	if err != nil {
		return nil, err
	}
	c.ReplayTimeout = time.Duration(secs) * time.Second

	c.CookieSecure = envBool("COOKIE_SECURE", false)
	c.CookieSameSite = parseSameSite(envOr("COOKIE_SAMESITE", "lax"))
	c.CookieDomain = strings.TrimSpace(os.Getenv("COOKIE_DOMAIN"))

	// Determine mode: production when a DATABASE_URL is present.
	c.Dev = c.DatabaseURL == ""

	// SECRET_ENC_KEY: required in prod. In dev, generate an ephemeral key so the
	// server boots, but warn via the returned config (caller logs it).
	if raw := os.Getenv("SECRET_ENC_KEY"); raw != "" {
		key, derr := decodeKey(raw)
		if derr != nil {
			return nil, fmt.Errorf("SECRET_ENC_KEY: %w", derr)
		}
		c.SecretEncKey = key
	} else if c.Dev {
		// Deterministic, obviously-insecure dev key so local encrypt/decrypt is
		// stable across restarts but never mistaken for production-grade.
		c.SecretEncKey = []byte("dev-insecure-aes-256-key-32bytes")
	} else {
		return nil, fmt.Errorf("SECRET_ENC_KEY is required (base64 of 32 bytes) when DATABASE_URL is set")
	}

	if raw := os.Getenv("SESSION_KEY"); raw != "" {
		c.SessionKey = []byte(raw)
	} else if c.Dev {
		c.SessionKey = []byte("dev-insecure-session-signing-key")
	} else {
		return nil, fmt.Errorf("SESSION_KEY is required when DATABASE_URL is set")
	}
	if len(c.SessionKey) < 16 {
		return nil, fmt.Errorf("SESSION_KEY must be at least 16 bytes")
	}

	if err := c.validate(); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Config) validate() error {
	if len(c.SecretEncKey) != 32 {
		return fmt.Errorf("SECRET_ENC_KEY must decode to exactly 32 bytes, got %d", len(c.SecretEncKey))
	}
	if c.MaxBodyBytes <= 0 {
		return fmt.Errorf("MAX_BODY_BYTES must be positive")
	}
	// Browsers reject a SameSite=None cookie that is not also Secure, which would
	// silently break login in production — fail fast instead.
	if c.CookieSameSite == http.SameSiteNoneMode && !c.CookieSecure {
		return fmt.Errorf("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject SameSite=None without Secure)")
	}
	return nil
}

// parseSameSite maps a config string to an http.SameSite mode (default Lax).
func parseSameSite(v string) http.SameSite {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "none":
		return http.SameSiteNoneMode
	case "strict":
		return http.SameSiteStrictMode
	default:
		return http.SameSiteLaxMode
	}
}

// GitHubConfigured reports whether live GitHub OAuth can run.
func (c *Config) GitHubConfigured() bool {
	return c.GitHubClientID != "" && c.GitHubClientSecret != ""
}

// DodoConfigured reports whether live Dodo API calls (checkout/portal) can run.
func (c *Config) DodoConfigured() bool { return c.DodoAPIKey != "" }

// DodoWebhooksConfigured reports whether incoming Dodo webhooks can be verified.
func (c *Config) DodoWebhooksConfigured() bool { return c.DodoWebhookSecret != "" }

// DodoBaseURL returns the Dodo API base URL for the configured environment.
func (c *Config) DodoBaseURL() string {
	if strings.EqualFold(c.DodoEnvironment, "live") {
		return "https://live.dodopayments.com"
	}
	return "https://test.dodopayments.com"
}

func decodeKey(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	// Try standard base64, then raw (no padding), then url-safe variants.
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding, base64.RawStdEncoding,
		base64.URLEncoding, base64.RawURLEncoding,
	} {
		if b, err := enc.DecodeString(raw); err == nil {
			if len(b) != 32 {
				return nil, fmt.Errorf("decoded to %d bytes, need 32", len(b))
			}
			return b, nil
		}
	}
	return nil, fmt.Errorf("not valid base64")
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) (int, error) {
	v := os.Getenv(k)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("%s: must be an integer: %w", k, err)
	}
	return n, nil
}

func envInt64(k string, def int64) (int64, error) {
	v := os.Getenv(k)
	if v == "" {
		return def, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s: must be an integer: %w", k, err)
	}
	return n, nil
}

func envBool(k string, def bool) bool {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}
