// Package api wires the authed JSON API, the public share + ingest routes, the
// SSE stream, and replay. Ownership is enforced on every endpoint- and
// event-scoped route.
package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"whook/internal/cryptox"
	"whook/internal/httpx"
	"whook/internal/replay"
	"whook/internal/sse"
	"whook/internal/store"
)

// API holds the dependencies shared by the JSON handlers.
type API struct {
	Store       store.Store
	Hub         *sse.Hub
	Cipher      *cryptox.Cipher
	Replay      *replay.Engine
	MaxJSONBody int64

	// Per-route auth middlewares, injected by package app:
	//   AuthSession      — session cookie only (browser routes).
	//   AuthSessionOrKey — session cookie OR a whk_ API key (programmatic routes).
	// Both may be nil in unit tests, where the caller injects the user id on the
	// request context directly; a nil middleware is then a pass-through.
	AuthSession      func(http.Handler) http.Handler
	AuthSessionOrKey func(http.Handler) http.Handler
}

// orPass returns mw, or a pass-through middleware when mw is nil.
func orPass(mw func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	if mw == nil {
		return func(next http.Handler) http.Handler { return next }
	}
	return mw
}

// enforceScope is per-route authorization for API-key auth. The scope model is
// method-based and needs no per-route table: a safe method (GET/HEAD) requires
// ScopeRead, any mutating method requires ScopeWrite. Session (cookie) auth and
// pre-scopes keys carry no scopes on the context, which ScopeAllowed treats as
// FULL access — so this only ever restricts a deliberately narrowed API key. A
// read-only key hitting a write route gets a 403 (JSON {"error":...}), not a 401.
// It runs AFTER auth (which stashes the scopes), so it wraps the inner handler.
func (a *API) enforceScope(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		want := store.ScopeWrite
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			want = store.ScopeRead
		}
		if !httpx.ScopeAllowed(r.Context(), want) {
			httpx.Error(w, http.StatusForbidden, "this api key lacks the \""+want+"\" scope for this request")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Mount registers the authed API routes on r (the /api subrouter). Each route
// declares its own auth: session-only for browser/management routes, or
// session-or-API-key for the programmatic read/write routes.
func (a *API) Mount(r chi.Router) {
	sess := orPass(a.AuthSession)
	// key = session-or-API-key auth, THEN method-based scope enforcement. Auth is
	// outermost so it populates the scopes the enforcement step reads.
	authKey := orPass(a.AuthSessionOrKey)
	key := func(next http.Handler) http.Handler {
		return authKey(a.enforceScope(next))
	}

	r.Route("/endpoints", func(r chi.Router) {
		r.With(key).Get("/", a.ListEndpoints)   // programmatic
		r.With(key).Post("/", a.CreateEndpoint) // programmatic
		r.Route("/{id}", func(r chi.Router) {
			r.With(sess).Get("/", a.GetEndpoint)
			r.With(sess).Patch("/", a.UpdateEndpoint)
			r.With(sess).Delete("/", a.DeleteEndpoint)
			r.With(sess).Put("/secret", a.SetSecret)
			r.With(sess).Delete("/secret", a.ClearSecret)
			r.With(sess).Put("/response", a.SetResponseRule)
			r.With(sess).Post("/sample", a.SendSample)
			r.With(key).Get("/events", a.ListEvents) // programmatic
			r.With(key).Get("/stream", a.Stream)     // programmatic (CLI forwarder)
		})
	})
	r.Route("/events/{id}", func(r chi.Router) {
		r.With(key).Get("/", a.GetEvent)         // programmatic
		r.With(key).Get("/body", a.GetEventBody) // programmatic (CLI fetches bodies)
		r.With(sess).Post("/replay", a.ReplayEvent)
		r.With(sess).Get("/replays", a.ListReplays)
		r.With(sess).Post("/share", a.CreateShare)
	})

	// Account management (session only).
	r.With(sess).Delete("/account", a.DeleteAccount)
	r.With(sess).Get("/account/export", a.ExportData)
	r.With(sess).Put("/account/theme", a.SetTheme)
	r.With(sess).Get("/account/notifications", a.GetNotifications)
	r.With(sess).Put("/account/notifications", a.SetNotifications)
	r.With(sess).Get("/activity", a.ListActivity)
	r.Route("/keys", func(r chi.Router) {
		r.With(sess).Get("/", a.ListKeys)
		r.With(sess).Post("/", a.CreateKey)
		r.With(sess).Delete("/{id}", a.DeleteKey)
		r.With(sess).Post("/{id}/rotate", a.RotateKey)
	})
}

// ownedEndpoint loads the endpoint named by the {id} URL param and verifies the
// authenticated user owns it. It writes the appropriate error and returns false
// on any failure (not found and forbidden are both reported as 404 so one user
// cannot probe another's endpoint ids).
func (a *API) ownedEndpoint(w http.ResponseWriter, r *http.Request) (*store.Endpoint, bool) {
	id := chi.URLParam(r, "id")
	ep, err := a.Store.GetEndpoint(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "endpoint not found")
		return nil, false
	}
	if ep.OwnerID != httpx.UserID(r.Context()) {
		httpx.Error(w, http.StatusNotFound, "endpoint not found")
		return nil, false
	}
	return ep, true
}

// ownedEvent loads the event named by {id}, then its endpoint, and verifies
// ownership. Returns both so handlers can use the endpoint's secret/provider.
func (a *API) ownedEvent(w http.ResponseWriter, r *http.Request) (*store.Event, *store.Endpoint, bool) {
	id := chi.URLParam(r, "id")
	ev, err := a.Store.GetEvent(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return nil, nil, false
	}
	ep, err := a.Store.GetEndpoint(r.Context(), ev.EndpointID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return nil, nil, false
	}
	if ep.OwnerID != httpx.UserID(r.Context()) {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return nil, nil, false
	}
	return ev, ep, true
}

func isNotFound(err error) bool { return errors.Is(err, store.ErrNotFound) }

// ctx is a tiny helper for handlers that need the request context.
func ctx(r *http.Request) context.Context { return r.Context() }
