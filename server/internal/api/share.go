package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"whook/internal/httpx"
	"whook/internal/store"
)

// redactedHeaders are stripped from a shared event so a public link never leaks
// credentials. Signature headers are kept (they're the point of the share and
// are not reusable without the secret).
var redactedHeaders = map[string]bool{
	"authorization":       true,
	"proxy-authorization": true,
	"cookie":              true,
	"set-cookie":          true,
	"x-api-key":           true,
}

// Share serves a single event read-only for a logged-out viewer, redaction-aware.
// No auth; the unguessable token is the capability.
func (a *API) Share(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	ev, err := a.Store.GetEventByShareToken(ctx(r), token)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	// Redact sensitive headers in the shared copy.
	safe := make([]store.HeaderPair, 0, len(ev.Headers))
	for _, h := range ev.Headers {
		if redactedHeaders[strings.ToLower(h.Name)] {
			safe = append(safe, store.HeaderPair{Name: h.Name, Value: "«redacted»"})
			continue
		}
		safe = append(safe, h)
	}
	shared := *ev
	shared.Headers = safe
	// A share link can only be created by a Pro user, so the full verify "why" is
	// intentionally shown to the (logged-out) viewer of the shared event.
	detail := eventDetail(&shared, true)
	detail["shared"] = true
	httpx.JSON(w, http.StatusOK, detail)
}
