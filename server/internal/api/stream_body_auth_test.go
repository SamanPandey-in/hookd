package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"whook/internal/httpx"
	"whook/internal/store"
)

// keyAuthRouter wires the API with the REAL per-route auth split: session-only
// routes always fail here (no session harness), and the session-or-key routes
// authenticate via a whk_ key resolved against the store. This proves /stream and
// /events/{id}/body are mounted under the key middleware (F4), not session-only.
func keyAuthRouter(a *API) http.Handler {
	a.AuthSession = func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			httpx.Error(w, http.StatusUnauthorized, "session required")
		})
	}
	a.AuthSessionOrKey = func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := ""
			if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
				raw = strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
			} else {
				raw = strings.TrimSpace(r.Header.Get("X-API-Key"))
			}
			uid, err := a.ResolveAPIKey(r.Context(), raw)
			if err != nil || uid <= 0 {
				httpx.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}
			next.ServeHTTP(w, r.WithContext(httpx.WithUserID(r.Context(), uid)))
		})
	}
	r := chi.NewRouter()
	r.Route("/api", func(r chi.Router) { a.Mount(r) })
	return r
}

func TestStreamAndBodyRoutesAcceptAPIKey(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 777, "cliuser")

	// Mint a real API key (while the default pass-through auth is still in place).
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]string{"name": "cli"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create key: %d %s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	fullKey := created["key"].(string)

	// Seed an endpoint + event owned by the key's user.
	ep := &store.Endpoint{OwnerID: uid}
	if err := st.CreateEndpoint(context.Background(), ep); err != nil {
		t.Fatalf("seed endpoint: %v", err)
	}
	ev := &store.Event{EndpointID: ep.ID, Method: http.MethodPost, RawBody: []byte(`{"hi":"there"}`)}
	if err := st.CreateEvent(context.Background(), ev); err != nil {
		t.Fatalf("seed event: %v", err)
	}

	router := keyAuthRouter(a)

	do := func(method, url, key string, ctx context.Context) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, url, nil)
		if ctx != nil {
			req = req.WithContext(ctx)
		}
		if key != "" {
			req.Header.Set("Authorization", "Bearer "+key)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}

	// --- GET /events/{id}/body ---
	if w := do(http.MethodGet, "/api/events/"+ev.ID+"/body", fullKey, nil); w.Code != http.StatusOK {
		t.Fatalf("body with valid key must be 200, got %d %s", w.Code, w.Body.String())
	} else if w.Body.String() != `{"hi":"there"}` {
		t.Fatalf("body route returned %q, want the raw bytes", w.Body.String())
	}
	if w := do(http.MethodGet, "/api/events/"+ev.ID+"/body", "whk_live_boguskey", nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("body with bad key must be 401, got %d %s", w.Code, w.Body.String())
	}
	if w := do(http.MethodGet, "/api/events/"+ev.ID+"/body", "", nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("body with no credential must be 401, got %d", w.Code)
	}

	// --- GET /endpoints/{id}/stream --- (cancel the context so the SSE loop exits)
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if w := do(http.MethodGet, "/api/endpoints/"+ep.ID+"/stream", fullKey, cancelled); w.Code != http.StatusOK {
		t.Fatalf("stream with valid key must be 200, got %d %s", w.Code, w.Body.String())
	} else if !strings.Contains(w.Body.String(), "connected to "+ep.ID) {
		t.Fatalf("stream should emit the connected comment, got %q", w.Body.String())
	}
	if w := do(http.MethodGet, "/api/endpoints/"+ep.ID+"/stream", "whk_live_boguskey", nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("stream with bad key must be 401, got %d %s", w.Code, w.Body.String())
	}
}
