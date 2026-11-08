// Package store is the persistence layer: domain types, the Store interface the
// rest of the backend codes against, a pgx/Postgres implementation, a SQL
// migration runner, and an in-memory fake used by unit tests (so handlers are
// testable without a database).
//
// Security notes:
//   - Signing secrets are stored only as AES-256-GCM ciphertext (SigningSecretEnc)
//     and are never returned on the Endpoint struct used by normal reads; callers
//     fetch ciphertext explicitly via GetEndpointSecret and decrypt transiently.
//   - Raw bodies are stored as bytea and never logged by this layer.
package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

// ErrNotFound is returned when a requested row does not exist.
var ErrNotFound = errors.New("store: not found")

// User is an authenticated account, linked to a GitHub identity.
type User struct {
	ID        int64
	GitHubID  int64
	Login     string
	Email     string
	AvatarURL string
	Name      string
	CreatedAt time.Time

	// Billing / plan state (see migration 0002). Plan defaults to "free".
	Plan           string
	DodoCustomerID string
	Subscription   Subscription

	// Theme is the account-synced appearance preference (migration 0007). Empty
	// means "no account preference set"; the client then uses its own default.
	Theme string

	// Notification preferences + billing email (migration 0008). These are
	// PREFERENCE STORAGE ONLY — no mail provider is wired, so nothing is sent.
	BillingEmail        string
	NotifyProduct       bool
	NotifyCaptureAlerts bool
}

// NotificationPrefs is the user-editable notification preference set stored on
// the user row. Delivery is deferred (no outbound-email provider in this
// build); the server only records intent.
type NotificationPrefs struct {
	BillingEmail        string `json:"billing_email"`
	NotifyProduct       bool   `json:"notify_product"`
	NotifyCaptureAlerts bool   `json:"notify_capture_alerts"`
}

// Subscription is a user's Dodo subscription state. The zero value (Status "")
// means the user has never subscribed; a free user has no live subscription.
type Subscription struct {
	ID                string `json:"-"`
	Status            string `json:"status"`             // active|on_hold|past_due|cancelled|expired|failed|...
	CurrentPeriodEnd  int64  `json:"current_period_end"` // unix ms (Dodo next_billing_date)
	CancelAtPeriodEnd bool   `json:"cancel_at_period_end"`
}

// ResponseRule is the HTTP response an endpoint returns to the webhook sender.
type ResponseRule struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

// DefaultResponseRule is the response used when none is configured: 200 {}.
func DefaultResponseRule() ResponseRule {
	return ResponseRule{
		Status:  200,
		Headers: map[string]string{"Content-Type": "application/json"},
		Body:    "{}",
	}
}

// Endpoint is a user-owned ingest target. ID is an unguessable ≥128-bit token
// used in the public path /i/{id}.
type Endpoint struct {
	ID            string       `json:"id"`
	OwnerID       int64        `json:"-"`
	Name          string       `json:"name"`
	Provider      string       `json:"provider"` // verify.Provider string, or "" for auto-detect
	HasSecret     bool         `json:"has_secret"`
	SecretMask    string       `json:"secret_mask,omitempty"`
	Response      ResponseRule `json:"response"`
	RetentionDays int          `json:"retention_days"`
	CreatedAt     time.Time    `json:"created_at"`
}

// HeaderPair preserves header order and duplicates exactly as received.
type HeaderPair struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// Event is a captured inbound webhook request.
type Event struct {
	ID          string       `json:"id"`
	EndpointID  string       `json:"endpoint_id"`
	Method      string       `json:"method"`
	Path        string       `json:"path"`
	Query       string       `json:"query"`
	Headers     []HeaderPair `json:"headers"`
	RawBody     []byte       `json:"-"` // served via dedicated raw/body routes, not inlined by default
	Size        int          `json:"size"`
	ContentType string       `json:"content_type"`
	// EventType is a derived, human-readable label for the webhook (e.g.
	// "checkout.session.completed" or "push"), produced at ingest from the body
	// or provider headers. Empty when none could be derived; treated as inert text.
	EventType     string            `json:"event_type"`
	SourceIP      string            `json:"source_ip"`
	ReceivedAtMS  int64             `json:"received_at_ms"`
	VerifyStatus  string            `json:"verify_status"`
	VerifyCause   string            `json:"verify_cause"`
	VerifySummary string            `json:"verify_summary"`
	VerifyDetails map[string]string `json:"verify_details"`
}

// RetentionTarget is what the retention purger needs to know about one endpoint:
// the retention the owner configured and the owner's current plan (which caps it).
type RetentionTarget struct {
	EndpointID    string
	RetentionDays int
	OwnerPlan     string
	// OwnerPeriodEndMS is the owner's last known subscription period end (unix
	// ms), 0 if they never subscribed. It anchors the downgrade grace period.
	OwnerPeriodEndMS int64
}

// ReplayAttempt records one replay of an event to a target URL.
type ReplayAttempt struct {
	ID              int64             `json:"id"`
	EventID         string            `json:"event_id"`
	TargetURL       string            `json:"target_url"`
	Resigned        bool              `json:"resigned"`
	ResponseStatus  int               `json:"response_status"`
	ResponseHeaders map[string]string `json:"response_headers"`
	ResponseBody    string            `json:"response_body"`
	LatencyMS       int64             `json:"latency_ms"`
	Error           string            `json:"error"`
	CreatedAt       time.Time         `json:"created_at"`
}

// APIKey is a programmatic bearer token owned by a user. Only KeyHash (a hex
// SHA-256 of the full key) is persisted; the plaintext key is returned exactly
// once at creation. Prefix is a short, non-secret display form (e.g.
// "whk_live_3f"). LastUsedAtMS is nil until the key authenticates a request.
type APIKey struct {
	ID           string `json:"id"`
	UserID       int64  `json:"-"`
	Name         string `json:"name"`
	KeyHash      string `json:"-"`
	Prefix       string `json:"prefix"`
	CreatedAtMS  int64  `json:"created_at_ms"`
	LastUsedAtMS *int64 `json:"last_used_at_ms"`
	// ExpiresAtMS is an optional expiry (unix ms); nil means the key never
	// expires. The auth middleware rejects a key once now >= ExpiresAtMS.
	ExpiresAtMS *int64 `json:"expires_at_ms"`
	// LastUsedIP is the best-effort client IP of the most recent authenticated
	// use (never a secret value); "" until first use.
	LastUsedIP string `json:"last_used_ip"`
	// Scopes narrows what the key may do (migration 0011). The minimal model is
	// ScopeRead (safe GETs) and ScopeWrite (anything that mutates). BACKWARD
	// COMPATIBILITY: an EMPTY slice means FULL access (both read and write) — this
	// is how every key issued before scopes existed behaves. A new key defaults to
	// both unless the caller narrows it. Never a secret value.
	Scopes []string `json:"scopes"`
}

// API-key scopes (migration 0011). The model is deliberately minimal:
//   - ScopeRead  — safe, read-only GETs (list/read endpoints, events, replays,
//     stream, me).
//   - ScopeWrite — anything that mutates (create/patch/delete endpoint, set/clear
//     secret, replay, send sample, set response rule, share).
//
// An EMPTY scope set is treated as FULL access (both) everywhere, so keys that
// predate scopes keep working unchanged.
const (
	ScopeRead  = "read"
	ScopeWrite = "write"
)

// FullScopes returns the default scope set granted to a new key when the caller
// does not narrow it: both read and write.
func FullScopes() []string { return []string{ScopeRead, ScopeWrite} }

// NormalizeScopes validates, lower-cases and de-duplicates a requested scope set
// against the known scopes, preserving a stable read-before-write order. Unknown
// entries are dropped. A nil/empty input returns nil (which callers treat as
// "full access"). ok is false only when the input was non-empty but contained no
// recognized scope (so callers can reject obvious garbage with a 400).
func NormalizeScopes(in []string) (out []string, ok bool) {
	if len(in) == 0 {
		return nil, true
	}
	var read, write bool
	for _, s := range in {
		switch strings.ToLower(strings.TrimSpace(s)) {
		case ScopeRead:
			read = true
		case ScopeWrite:
			write = true
		}
	}
	if read {
		out = append(out, ScopeRead)
	}
	if write {
		out = append(out, ScopeWrite)
	}
	return out, len(out) > 0
}

// ScopesAllow reports whether a key carrying scopes may perform an action that
// requires want. An empty scope set is full access (both), so it always allows.
func ScopesAllow(scopes []string, want string) bool {
	if len(scopes) == 0 {
		return true
	}
	for _, s := range scopes {
		if s == want {
			return true
		}
	}
	return false
}

// Activity is one entry in a user's audit log. Action is a short machine string
// (e.g. "endpoint.created"); Target is a short human label; Metadata is a small
// JSON object. CreatedAtMS is unix ms.
type Activity struct {
	ID          int64             `json:"id"`
	UserID      int64             `json:"-"`
	Action      string            `json:"action"`
	Target      string            `json:"target"`
	Metadata    map[string]string `json:"metadata"`
	CreatedAtMS int64             `json:"created_at_ms"`
	// IP + UserAgent are captured best-effort on login and sensitive actions
	// (migration 0010); "" when not captured. Neither is a secret value.
	IP        string `json:"ip"`
	UserAgent string `json:"user_agent"`
}

// EventFilter constrains an events listing. Zero values mean "no filter".
type EventFilter struct {
	Provider     string // currently informational; events carry endpoint provider
	Method       string
	VerifyStatus string // pass | fail | unknown
	Text         string // substring match in raw body (case-insensitive)
	Limit        int    // defaults applied by store (e.g. 100)
	BeforeMS     int64  // cursor: only events with received_at_ms < BeforeMS
}

// Store is the persistence contract the backend depends on. A pgx-backed
// Postgres implementation is the real one; an in-memory fake implements it for
// unit tests.
type Store interface {
	// Users.
	UpsertUserByGitHub(ctx context.Context, githubID int64, login, email string) (*User, error)
	GetUser(ctx context.Context, id int64) (*User, error)
	// UpdateUserProfile persists display profile fields captured at login.
	UpdateUserProfile(ctx context.Context, userID int64, avatarURL, name string) error
	// UpdateUserTheme persists the account-synced appearance theme.
	UpdateUserTheme(ctx context.Context, userID int64, theme string) error
	// UpdateNotificationPrefs persists notification preferences + billing email.
	UpdateNotificationPrefs(ctx context.Context, userID int64, prefs NotificationPrefs) error
	// DeleteAccount removes the user and cascades all their data (endpoints,
	// events, replay attempts, api keys, activity) within a transaction.
	DeleteAccount(ctx context.Context, userID int64) error

	// Billing.
	// GetUserByDodoCustomerID finds the user a Dodo customer belongs to.
	GetUserByDodoCustomerID(ctx context.Context, customerID string) (*User, error)
	// SetUserDodoCustomer records the Dodo customer id for a user (idempotent).
	SetUserDodoCustomer(ctx context.Context, userID int64, customerID string) error
	// UpdateUserSubscription sets a user's plan + subscription state atomically.
	UpdateUserSubscription(ctx context.Context, userID int64, plan string, sub Subscription) error
	// MarkWebhookProcessed records a Standard-Webhooks id as handled. It returns
	// inserted=false if the id was already present (a duplicate delivery).
	MarkWebhookProcessed(ctx context.Context, webhookID string) (inserted bool, err error)

	// Endpoints.
	CreateEndpoint(ctx context.Context, e *Endpoint) error
	GetEndpoint(ctx context.Context, id string) (*Endpoint, error)
	ListEndpoints(ctx context.Context, ownerID int64) ([]*Endpoint, error)
	UpdateEndpoint(ctx context.Context, e *Endpoint) error
	DeleteEndpoint(ctx context.Context, id string, ownerID int64) error
	// SetEndpointSecret stores the already-encrypted secret (or clears it when enc is nil).
	SetEndpointSecret(ctx context.Context, id string, enc []byte, mask string) error
	// GetEndpointSecret returns the encrypted secret bytes (nil if none set).
	GetEndpointSecret(ctx context.Context, id string) ([]byte, error)

	// Events.
	CreateEvent(ctx context.Context, ev *Event) error
	GetEvent(ctx context.Context, id string) (*Event, error)
	ListEvents(ctx context.Context, endpointID string, f EventFilter) ([]*Event, error)
	DeleteOldEvents(ctx context.Context, endpointID string, olderThan time.Time) (int64, error)
	// ListRetentionTargets returns every endpoint with its configured retention
	// and its owner's plan, for the background purger.
	ListRetentionTargets(ctx context.Context) ([]RetentionTarget, error)

	// Share links (token -> single event, no auth).
	CreateShare(ctx context.Context, eventID string) (string, error)
	GetEventByShareToken(ctx context.Context, token string) (*Event, error)

	// Replay attempts.
	CreateReplayAttempt(ctx context.Context, a *ReplayAttempt) error
	ListReplayAttempts(ctx context.Context, eventID string) ([]*ReplayAttempt, error)

	// API keys.
	CreateAPIKey(ctx context.Context, k *APIKey) error
	ListAPIKeys(ctx context.Context, userID int64) ([]*APIKey, error)
	DeleteAPIKey(ctx context.Context, id string, userID int64) error
	// RotateAPIKey replaces a key's secret (hash + display prefix) in place,
	// keeping its id/name/expiry and resetting last-used, scoped to the owner.
	RotateAPIKey(ctx context.Context, id string, userID int64, newHash, newPrefix string) error
	// LookupAPIKeyByHash resolves a key by its hex SHA-256 hash (for auth).
	LookupAPIKeyByHash(ctx context.Context, keyHash string) (*APIKey, error)
	// TouchAPIKey records the last-used timestamp (unix ms) and client IP for a key.
	TouchAPIKey(ctx context.Context, id string, atMS int64, ip string) error

	// Activity log.
	InsertActivity(ctx context.Context, a *Activity) error
	// ListActivity returns the caller's audit log newest-first. beforeMS > 0 is a
	// pagination cursor (only rows with created_at_ms < beforeMS).
	ListActivity(ctx context.Context, userID int64, limit int, beforeMS int64) ([]*Activity, error)

	// Close releases resources.
	Close()
}

// NewToken returns an unguessable hex token with nBytes of entropy (use >=16
// for the required ≥128-bit endpoint IDs and event/share IDs).
func NewToken(nBytes int) string {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failing is catastrophic; fail loudly rather than return a
		// predictable token.
		panic("store: crypto/rand failed: " + err.Error())
	}
	return hex.EncodeToString(b)
}
