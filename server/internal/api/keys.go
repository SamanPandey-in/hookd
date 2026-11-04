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

// ResolveAPIKey authenticates a raw API key to its owning user id and records
// last-used (best-effort). It is passed to auth.AuthSessionOrKey.
func (a *API) ResolveAPIKey(ctx context.Context, raw string) (int64, error) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "whk_") {
		return 0, errors.New("api: not an api key")
	}
	k, err := a.Store.LookupAPIKeyByHash(ctx, hashKey(raw))
	if err != nil {
		return 0, err
	}
	_ = a.Store.TouchAPIKey(ctx, k.ID, time.Now().UnixMilli())
	return k.UserID, nil
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
	httpx.JSON(w, http.StatusOK, keys)
}

type createKeyReq struct {
	Name string `json:"name"`
}

// CreateKey issues a new API key and returns the full key exactly once.
func (a *API) CreateKey(w http.ResponseWriter, r *http.Request) {
	var req createKeyReq
	// Body is optional; a key may be created without a name.
	_ = httpx.DecodeJSON(w, r, a.MaxJSONBody, &req)
	req.Name = strings.TrimSpace(req.Name)

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
	})
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

// keyLabel is a short human label for the activity log (name or prefix).
func keyLabel(k *store.APIKey) string {
	if k.Name != "" {
		return k.Name
	}
	return k.Prefix
}
