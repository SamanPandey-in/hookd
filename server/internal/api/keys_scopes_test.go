package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"whook/internal/httpx"
)

// scopedKeyRouter wires the API with an auth middleware that mimics the real
// auth.AuthSessionOrKey: it resolves a whk_ key via ResolveAPIKey AND stashes the
// key's scopes on the context, so Mount's method-based enforceScope runs for
// real. Session-only routes always 401 here (no session harness).
func scopedKeyRouter(a *API) http.Handler {
	a.AuthSession = func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			httpx.Error(w, http.StatusUnauthorized, "session required")
		})
	}
	a.AuthSessionOrKey = func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
			uid, scopes, err := a.ResolveAPIKey(r.Context(), raw)
			if err != nil || uid <= 0 {
				httpx.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}
			ctx := httpx.WithScopes(httpx.WithUserID(r.Context(), uid), scopes)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
	r := chi.NewRouter()
	r.Route("/api", func(r chi.Router) { a.Mount(r) })
	return r
}

// mintKey creates a key for uid with the given scopes (nil => default both) via
// the real CreateKey handler, and returns its full secret.
func mintKey(t *testing.T, a *API, uid int64, scopes []string) string {
	t.Helper()
	body := map[string]any{"name": "scoped"}
	if scopes != nil {
		body["scopes"] = scopes
	}
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", body))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create key: %d %s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	return created["key"].(string)
}

func TestAPIKeyScopeEnforcement(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 801, "scoper")

	readKey := mintKey(t, a, uid, []string{"read"})
	fullKey := mintKey(t, a, uid, nil) // default => both

	router := scopedKeyRouter(a)
	do := func(method, url, key string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, url, strings.NewReader("{}"))
		req.Header.Set("Content-Type", "application/json")
		if key != "" {
			req.Header.Set("Authorization", "Bearer "+key)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}

	// read-only key: GET (read) allowed, POST (write) -> 403, not 401.
	if w := do(http.MethodGet, "/api/endpoints/", readKey); w.Code != http.StatusOK {
		t.Fatalf("read key GET endpoints must be 200, got %d %s", w.Code, w.Body.String())
	}
	if w := do(http.MethodPost, "/api/endpoints/", readKey); w.Code != http.StatusForbidden {
		t.Fatalf("read key POST endpoints must be 403, got %d %s", w.Code, w.Body.String())
	}

	// full key: both read and write succeed.
	if w := do(http.MethodGet, "/api/endpoints/", fullKey); w.Code != http.StatusOK {
		t.Fatalf("full key GET must be 200, got %d %s", w.Code, w.Body.String())
	}
	if w := do(http.MethodPost, "/api/endpoints/", fullKey); w.Code != http.StatusCreated {
		t.Fatalf("full key POST must be 201, got %d %s", w.Code, w.Body.String())
	}
}

func TestCreateKeyScopesInResponse(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 802, "scopesresp")

	// Default create => both scopes, echoed in the response.
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]any{"name": "d"}))
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	sc, _ := created["scopes"].([]any)
	if len(sc) != 2 {
		t.Fatalf("default key should carry 2 scopes, got %v", created["scopes"])
	}

	// read-only create => scopes:["read"].
	rec = serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]any{"name": "r", "scopes": []string{"read"}}))
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	sc, _ = created["scopes"].([]any)
	if len(sc) != 1 || sc[0] != "read" {
		t.Fatalf("read-only key should carry scopes:[read], got %v", created["scopes"])
	}

	// garbage scopes (non-empty, no valid entry) => 400.
	rec = serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]any{"name": "x", "scopes": []string{"bogus"}}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid scopes must be 400, got %d %s", rec.Code, rec.Body.String())
	}

	// List serializes scopes as an array for every key.
	rec = serveAs(a, uid, jsonReq(http.MethodGet, "/api/keys", nil))
	var list []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	for _, k := range list {
		if _, ok := k["scopes"].([]any); !ok {
			t.Fatalf("list entry must carry scopes array, got %v", k["scopes"])
		}
	}
}

func TestRotatePreservesScopes(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 803, "rotscope")

	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]any{"name": "r", "scopes": []string{"read"}}))
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	id := created["id"].(string)

	rec = serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys/"+id+"/rotate", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("rotate: %d %s", rec.Code, rec.Body.String())
	}
	var rotated map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &rotated)
	sc, _ := rotated["scopes"].([]any)
	if len(sc) != 1 || sc[0] != "read" {
		t.Fatalf("rotate must preserve scopes:[read], got %v", rotated["scopes"])
	}
}
