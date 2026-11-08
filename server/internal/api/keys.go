package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"whook/internal/httpx"
	"whook/internal/plan"
	"whook/internal/store"
)

// keyEnvPrefix is the fixed, non-secret prefix every issued key carries. The
// stored display prefix is the first 11 characters of the key (e.g.
// "whk_live_3f"): this env marker plus the first two random hex chars.
const keyEnvPrefix = "whk_live_"

// displayPrefixLen is how many leading characters of a key we keep for display.
const displayPrefixLen = 11

// ProMaxAPIKeys / FreeMaxAPIKeys are the per-plan key caps.
const (
	FreeMaxAPIKeys = 2
	ProMaxAPIKeys  = 20
)

func maxAPIKeys(p string) int {
	if plan.IsPro(p) {
		return ProMaxAPIKeys
	}
	return FreeMaxAPIKeys
}

// newAPIKey mints a fresh key, returning the full plaintext (shown once), its
// hex SHA-256 hash (stored), and its display prefix.
func newAPIKey() (full, hash, prefix string) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("api: crypto/rand failed: " + err.Error())
	}
	full = keyEnvPrefix + hex.EncodeToString(b) // whk_live_ + 64 hex chars
	sum := sha256.Sum256([]byte(full))
	hash = hex.EncodeToString(sum[:])
	prefix = full[:displayPrefixLen]
	return full, hash, prefix
}

// hashKey returns the hex SHA-256 hash used to look a key up.
func hashKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// ResolveAPIKey authenticates a raw API key to its owning user id + the key's
// scopes, and records last-used (best-effort). It is passed to
// auth.AuthSessionOrKey, which stashes the scopes on the request context so
// per-route enforcement can 403 a narrowed key. An empty scope set means FULL
// access (both) — a pre-scopes key.
func (a *API) ResolveAPIKey(ctx context.Context, raw string) (int64, []string, error) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "whk_") {
		return 0, nil, errors.New("api: not an api key")
	}
	k, err := a.Store.LookupAPIKeyByHash(ctx, hashKey(raw))
	if err != nil {
		return 0, nil, err
	}
	now := time.Now().UnixMilli()
	// Enforce expiry: an expired key authenticates nothing (middleware -> 401).
	if k.ExpiresAtMS != nil && now >= *k.ExpiresAtMS {
		return 0, nil, errors.New("api: api key expired")
	}
	// Record last-used time + client IP (best-effort; never blocks auth). The IP
	// is stashed on the context by the auth middleware (WithRequestMeta).
	_ = a.Store.TouchAPIKey(ctx, k.ID, now, httpx.ClientIPFromContext(ctx))
	return k.UserID, k.Scopes, nil
}

// ListKeys returns the caller's API keys (masked — never the key itself).
func (a *API) ListKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := a.Store.ListAPIKeys(ctx(r), httpx.UserID(r.Context()))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not list api keys")
		return
	}
	if keys == nil {
		keys = []*store.APIKey{}
	}
	// Ensure scopes always serialize as a JSON array (never null) so the client's
	// `scopes: string[]` shape holds. An empty array means full access (both).
	for _, k := range keys {
		if k.Scopes == nil {
			k.Scopes = []string{}
		}
	}
	httpx.JSON(w, http.StatusOK, keys)
}

type createKeyReq struct {
	Name string `json:"name"`
	// ExpiresAtMS is an optional expiry (unix ms); nil/0 => never expires.
	ExpiresAtMS *int64 `json:"expires_at_ms"`
	// Scopes optionally narrows the key. Omitted/empty => both read and write
	// (full access). Accepts any subset of {"read","write"}; unknown entries are
	// ignored, and a non-empty set with no recognized scope is rejected (400).
	Scopes []string `json:"scopes"`
}

// CreateKey issues a new API key and returns the full key exactly once.
func (a *API) CreateKey(w http.ResponseWriter, r *http.Request) {
	var req createKeyReq
	// Body is optional; a key may be created without a name.
	_ = httpx.DecodeJSON(w, r, a.MaxJSONBody, &req)
	req.Name = strings.TrimSpace(req.Name)

	// A provided expiry must be in the future.
	expiresAt := req.ExpiresAtMS
	if expiresAt != nil {
		if *expiresAt == 0 {
			expiresAt = nil
		} else if *expiresAt <= time.Now().UnixMilli() {
			httpx.Error(w, http.StatusBadRequest, "expires_at_ms must be in the future")
			return
		}
	}

	// Resolve scopes: default to full (read+write) when the caller does not narrow
	// the key; otherwise validate the requested subset.
	scopes := store.FullScopes()
	if len(req.Scopes) > 0 {
		normalized, ok := store.NormalizeScopes(req.Scopes)
		if !ok {
			httpx.Error(w, http.StatusBadRequest, `scopes must be a subset of ["read","write"]`)
			return
		}
		scopes = normalized
	}

	uid := httpx.UserID(r.Context())
	// Enforce the per-plan key cap.
	existing, err := a.Store.ListAPIKeys(ctx(r), uid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not check key count")
		return
	}
	if len(existing) >= maxAPIKeys(a.userPlan(r)) {
		writeUpgrade(w, "you have reached your plan's API key limit")
		return
	}

	full, hash, prefix := newAPIKey()
	k := &store.APIKey{
		UserID:      uid,
		Name:        req.Name,
		KeyHash:     hash,
		Prefix:      prefix,
		CreatedAtMS: time.Now().UnixMilli(),
		ExpiresAtMS: expiresAt,
		Scopes:      scopes,
	}
	if err := a.Store.CreateAPIKey(ctx(r), k); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create api key")
		return
	}
	a.recordActivity(ctx(r), uid, "key.created", keyLabel(k), map[string]string{"prefix": prefix})
	httpx.JSON(w, http.StatusCreated, map[string]any{
		"id":            k.ID,
		"name":          k.Name,
		"key":           full, // shown exactly once; never persisted or returned again
		"prefix":        k.Prefix,
		"created_at_ms": k.CreatedAtMS,
		"expires_at_ms": k.ExpiresAtMS,
		"scopes":        scopesOut(k.Scopes),
	})
}

// RotateKey issues a NEW secret for an existing key, keeping its id/name/expiry
// and resetting last-used. The new plaintext is returned exactly once; the old
// secret stops authenticating immediately.
func (a *API) RotateKey(w http.ResponseWriter, r *http.Request) {
	uid := httpx.UserID(r.Context())
	id := chi.URLParam(r, "id")

	full, hash, prefix := newAPIKey()
	if err := a.Store.RotateAPIKey(ctx(r), id, uid, hash, prefix); err != nil {
		if isNotFound(err) {
			httpx.Error(w, http.StatusNotFound, "api key not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "could not rotate api key")
		return
	}

	// Re-read the rotated key so the response carries its retained metadata.
	var rotated *store.APIKey
	if keys, err := a.Store.ListAPIKeys(ctx(r), uid); err == nil {
		for _, k := range keys {
			if k.ID == id {
				rotated = k
			}
		}
	}
	resp := map[string]any{
		"id":     id,
		"key":    full, // shown exactly once; never persisted or returned again
		"prefix": prefix,
	}
	if rotated != nil {
		resp["name"] = rotated.Name
		resp["created_at_ms"] = rotated.CreatedAtMS
		resp["expires_at_ms"] = rotated.ExpiresAtMS
		resp["scopes"] = scopesOut(rotated.Scopes) // rotation preserves scopes
		a.recordActivity(ctx(r), uid, "key.rotated", keyLabel(rotated), map[string]string{"prefix": prefix})
	} else {
		a.recordActivity(ctx(r), uid, "key.rotated", prefix, map[string]string{"prefix": prefix})
	}
	httpx.JSON(w, http.StatusOK, resp)
}

// DeleteKey revokes one of the caller's API keys.
func (a *API) DeleteKey(w http.ResponseWriter, r *http.Request) {
	uid := httpx.UserID(r.Context())
	id := chi.URLParam(r, "id")
	// Capture a label for the activity log before deleting (best-effort).
	label := id
	if keys, err := a.Store.ListAPIKeys(ctx(r), uid); err == nil {
		for _, k := range keys {
			if k.ID == id {
				label = keyLabel(k)
			}
		}
	}
	if err := a.Store.DeleteAPIKey(ctx(r), id, uid); err != nil {
		if isNotFound(err) {
			httpx.Error(w, http.StatusNotFound, "api key not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "could not delete api key")
		return
	}
	a.recordActivity(ctx(r), uid, "key.revoked", label, nil)
	w.WriteHeader(http.StatusNoContent)
}

// scopesOut normalizes a key's scope set for JSON output so it is always an
// array (never null). An empty array means full access (both read and write).
func scopesOut(scopes []string) []string {
	if scopes == nil {
		return []string{}
	}
	return scopes
}

// keyLabel is a short human label for the activity log (name or prefix).
func keyLabel(k *store.APIKey) string {
	if k.Name != "" {
		return k.Name
	}
	return k.Prefix
}
