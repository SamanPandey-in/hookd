package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"whook/internal/cryptox"
	"whook/internal/httpx"
	"whook/internal/replay"
	"whook/internal/sse"
	"whook/internal/store"
)

func newAPI(t *testing.T) (*API, *store.Fake) {
	t.Helper()
	st := store.NewFake()
	cipher, _ := cryptox.New([]byte("0123456789abcdef0123456789abcdef"))
	a := &API{
		Store:       st,
		Hub:         sse.NewHub(),
		Cipher:      cipher,
		Replay:      replay.NewEngine(0, 0),
		MaxJSONBody: 1 << 20,
	}
	return a, st
}

// serveAs runs req through the authed API router as user uid.
func serveAs(a *API, uid int64, req *http.Request) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, rq *http.Request) {
				next.ServeHTTP(w, rq.WithContext(httpx.WithUserID(rq.Context(), uid)))
			})
		})
		r.Route("/api", func(r chi.Router) { a.Mount(r) })
	})
	// public share route
	r.Get("/share/{token}", a.Share)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

// proUser seeds a Pro-plan user in the store and returns its id, for tests that
// exercise Pro-gated behavior (replay, response rules, shares, search).
func proUser(t *testing.T, st *store.Fake) int64 {
	t.Helper()
	u, err := st.UpsertUserByGitHub(context.Background(), 1000+int64(len(t.Name())), "pro", "pro@example.com")
	if err != nil {
		t.Fatalf("seed pro user: %v", err)
	}
	if err := st.UpdateUserSubscription(context.Background(), u.ID, "pro",
		store.Subscription{Status: "active"}); err != nil {
		t.Fatalf("set pro: %v", err)
	}
	return u.ID
}

func jsonReq(method, url string, body any) *http.Request {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, url, &buf)
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestEndpointCRUDAndOwnership(t *testing.T) {
	a, _ := newAPI(t)

	// Create as user 1.
	rec := serveAs(a, 1, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "mine", "provider": "stripe"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
	}
	var ep store.Endpoint
	_ = json.Unmarshal(rec.Body.Bytes(), &ep)
	if ep.ID == "" || len(ep.ID) < 32 {
		t.Fatalf("endpoint id must be a long unguessable token, got %q", ep.ID)
	}

	// User 2 cannot see user 1's endpoint.
	rec = serveAs(a, 2, jsonReq(http.MethodGet, "/api/endpoints/"+ep.ID, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-user read must be 404, got %d", rec.Code)
	}

	// Owner can.
	rec = serveAs(a, 1, jsonReq(http.MethodGet, "/api/endpoints/"+ep.ID, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("owner read: %d", rec.Code)
	}

	// User 2 cannot delete.
	rec = serveAs(a, 2, jsonReq(http.MethodDelete, "/api/endpoints/"+ep.ID, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-user delete must be 404, got %d", rec.Code)
	}
}

func TestSecretNeverReturnedInFull(t *testing.T) {
	a, st := newAPI(t)
	rec := serveAs(a, 1, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "s", "provider": "stripe"}))
	var ep store.Endpoint
	_ = json.Unmarshal(rec.Body.Bytes(), &ep)

	rec = serveAs(a, 1, jsonReq(http.MethodPut, "/api/endpoints/"+ep.ID+"/secret", map[string]string{"secret": "whsec_supersecret12345"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("set secret: %d %s", rec.Code, rec.Body.String())
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("supersecret")) {
		t.Fatal("response leaked the raw secret")
	}

	// Stored ciphertext must decrypt back to the secret but not equal it.
	enc, _ := st.GetEndpointSecret(context.Background(), ep.ID)
	if len(enc) == 0 {
		t.Fatal("secret not stored")
	}
	if bytes.Contains(enc, []byte("whsec_supersecret12345")) {
		t.Fatal("secret stored as plaintext!")
	}
	got, _ := a.Cipher.DecryptString(enc)
	if got != "whsec_supersecret12345" {
		t.Fatalf("decrypt mismatch: %q", got)
	}

	// Endpoint detail reports has_secret + mask, never the secret.
	rec = serveAs(a, 1, jsonReq(http.MethodGet, "/api/endpoints/"+ep.ID, nil))
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"has_secret":true`)) {
		t.Fatalf("expected has_secret true, got %s", rec.Body.String())
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("supersecret")) {
		t.Fatal("endpoint detail leaked the secret")
	}
}

func TestResponseRuleValidation(t *testing.T) {
	a, st := newAPI(t)
	pu := proUser(t, st) // response rules are Pro-gated
	rec := serveAs(a, pu, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "r"}))
	var ep store.Endpoint
	_ = json.Unmarshal(rec.Body.Bytes(), &ep)

	// Invalid status rejected.
	rec = serveAs(a, pu, jsonReq(http.MethodPut, "/api/endpoints/"+ep.ID+"/response", map[string]any{"status": 42, "body": "x"}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid status should be 400, got %d", rec.Code)
	}
	// Valid rule accepted.
	rec = serveAs(a, pu, jsonReq(http.MethodPut, "/api/endpoints/"+ep.ID+"/response", map[string]any{"status": 503, "body": "down"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("valid rule: %d %s", rec.Code, rec.Body.String())
	}
}

func TestSendSampleAndShare(t *testing.T) {
	a, st := newAPI(t)
	pu := proUser(t, st) // share links are Pro-gated
	rec := serveAs(a, pu, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "s", "provider": "stripe"}))
	var ep store.Endpoint
	_ = json.Unmarshal(rec.Body.Bytes(), &ep)

	// Send a sample (no secret -> verify unknown, but event is injected).
	rec = serveAs(a, pu, jsonReq(http.MethodPost, "/api/endpoints/"+ep.ID+"/sample", map[string]string{}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("sample: %d %s", rec.Code, rec.Body.String())
	}
	var sampleResp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &sampleResp)
	evID, _ := sampleResp["id"].(string)
	if evID == "" {
		t.Fatal("sample did not return an event id")
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("checkout.session.completed")) {
		t.Error("stripe sample body missing")
	}

	// Create a share link for the event.
	rec = serveAs(a, pu, jsonReq(http.MethodPost, "/api/events/"+evID+"/share", nil))
	if rec.Code != http.StatusCreated {
		t.Fatalf("share create: %d %s", rec.Code, rec.Body.String())
	}
	var share map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &share)
	token := share["token"]
	if token == "" {
		t.Fatal("no share token returned")
	}

	// Fetch the share as a logged-out viewer (no uid context needed, but route is public).
	rec = serveAs(a, 0, jsonReq(http.MethodGet, "/share/"+token, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("public share fetch: %d %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"shared":true`)) {
		t.Error("share response not marked shared")
	}

	_ = st // keep reference
}

func TestShareRedactsSensitiveHeaders(t *testing.T) {
	a, st := newAPI(t)
	ep := &store.Endpoint{OwnerID: 1}
	_ = st.CreateEndpoint(context.Background(), ep)
	ev := &store.Event{
		EndpointID: ep.ID,
		Method:     "POST",
		Headers: []store.HeaderPair{
			{Name: "Authorization", Value: "Bearer super-secret-token"},
			{Name: "Cookie", Value: "session=abc"},
			{Name: "X-Safe", Value: "visible"},
		},
		RawBody: []byte(`{"ok":true}`),
	}
	_ = st.CreateEvent(context.Background(), ev)
	token, _ := st.CreateShare(context.Background(), ev.ID)

	rec := serveAs(a, 0, jsonReq(http.MethodGet, "/share/"+token, nil))
	if bytes.Contains(rec.Body.Bytes(), []byte("super-secret-token")) {
		t.Fatal("share leaked Authorization header")
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("session=abc")) {
		t.Fatal("share leaked Cookie header")
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("visible")) {
		t.Fatal("share dropped a safe header")
	}
}

func TestReplayOwnershipEnforced(t *testing.T) {
	a, st := newAPI(t)
	ep := &store.Endpoint{OwnerID: 1}
	_ = st.CreateEndpoint(context.Background(), ep)
	ev := &store.Event{EndpointID: ep.ID, Method: "POST", RawBody: []byte("{}")}
	_ = st.CreateEvent(context.Background(), ev)

	// User 2 cannot replay user 1's event.
	rec := serveAs(a, 2, jsonReq(http.MethodPost, "/api/events/"+ev.ID+"/replay", map[string]any{"target_url": "https://example.com"}))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-user replay must be 404, got %d", rec.Code)
	}
}

func TestReplayBlockedTargetRecorded(t *testing.T) {
	a, st := newAPI(t)
	pu := proUser(t, st) // replay is Pro-gated
	ep := &store.Endpoint{OwnerID: pu}
	_ = st.CreateEndpoint(context.Background(), ep)
	ev := &store.Event{EndpointID: ep.ID, Method: "POST", RawBody: []byte("{}")}
	_ = st.CreateEvent(context.Background(), ev)

	rec := serveAs(a, pu, jsonReq(http.MethodPost, "/api/events/"+ev.ID+"/replay", map[string]any{"target_url": "http://10.0.0.1/x"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("blocked replay returns 200 with recorded attempt, got %d %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"delivered":false`)) {
		t.Error("blocked replay should report delivered:false")
	}
	attempts, _ := st.ListReplayAttempts(context.Background(), ev.ID)
	if len(attempts) != 1 || attempts[0].Error == "" {
		t.Fatalf("blocked attempt must be persisted with an error, got %+v", attempts)
	}
}
