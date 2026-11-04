package api

import (
	"context"
	"net/http"

	"whook/internal/httpx"
	"whook/internal/store"
)

// recordActivity writes one audit-log entry for the user. It is best-effort: a
// logging failure never blocks or fails the underlying request.
func (a *API) recordActivity(ctx context.Context, userID int64, action, target string, metadata map[string]string) {
	_ = a.Store.InsertActivity(ctx, &store.Activity{
		UserID:   userID,
		Action:   action,
		Target:   target,
		Metadata: metadata,
	})
}

// ListActivity returns the caller's audit log, newest first (default 50).
func (a *API) ListActivity(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if n := atoiSafe(r.URL.Query().Get("limit")); n > 0 {
		limit = n
	}
	entries, err := a.Store.ListActivity(ctx(r), httpx.UserID(r.Context()), limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not list activity")
		return
	}
	if entries == nil {
		entries = []*store.Activity{}
	}
	httpx.JSON(w, http.StatusOK, entries)
}

// DeleteAccount permanently deletes the caller's account and cascades all their
// data (endpoints, events, replay attempts, api keys, activity). The frontend
// logs out afterwards.
func (a *API) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	uid := httpx.UserID(r.Context())
	if err := a.Store.DeleteAccount(ctx(r), uid); err != nil {
		if isNotFound(err) {
			httpx.Error(w, http.StatusNotFound, "account not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "could not delete account")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
