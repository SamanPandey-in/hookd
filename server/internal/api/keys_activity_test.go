package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"whook/internal/store"
)

// seedUser creates a real user in the fake store and returns its id, so handlers
// that read the user row (plan gating, delete-account) behave realistically.
func seedUser(t *testing.T, st *store.Fake, gh int64, login string) int64 {
	t.Helper()
	u, err := st.UpsertUserByGitHub(context.Background(), gh, login, login+"@x.com")
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return u.ID
}

func TestAPIKeyLifecycleAndCap(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 501, "freeuser") // free plan by default

	// Create first key; full key returned exactly once.
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]string{"name": "ci"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create key: %d %s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	full, _ := created["key"].(string)
	if !strings.HasPrefix(full, "whk_") {
		t.Fatalf("key must start with whk_, got %q", full)
	}
	prefix, _ := created["prefix"].(string)
	if len(prefix) != 11 || !strings.HasPrefix(full, prefix) {
		t.Fatalf("prefix must be the first 11 chars of the key, got %q for %q", prefix, full)
	}

	// Second key ok (free cap is 2).
	rec = serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]string{"name": "two"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("second key should succeed: %d", rec.Code)
	}

	// Third key over the free cap -> 402 upgrade envelope.
	rec = serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]string{"name": "three"}))
	if rec.Code != http.StatusPaymentRequired {
		t.Fatalf("over free cap must be 402, got %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"upgrade":true`) {
		t.Errorf("402 should carry upgrade:true, got %s", rec.Body.String())
	}

	// List is masked: never leaks a full key, exposes the prefix.
	rec = serveAs(a, uid, jsonReq(http.MethodGet, "/api/keys", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list keys: %d", rec.Code)
	}
	var list []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 2 {
		t.Fatalf("expected 2 keys, got %d", len(list))
	}
	if strings.Contains(rec.Body.String(), full) {
		t.Fatal("list leaked a full key")
	}
	for _, k := range list {
		if _, ok := k["key"]; ok {
			t.Fatal("list entries must not contain a key field")
		}
		if k["prefix"] == nil {
			t.Fatal("list entries must include a prefix")
		}
	}
}

func TestResolveAPIKey(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 502, "keyer")
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]string{"name": "cli"}))
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	full := created["key"].(string)
	keyID := created["id"].(string)

	// Resolves to the owner with full (default) scopes.
	got, scopes, err := a.ResolveAPIKey(context.Background(), full)
	if err != nil || got != uid {
		t.Fatalf("resolve key: got (%d,%v), want %d", got, err, uid)
	}
	// A key created without a scopes request defaults to both read and write.
	if len(scopes) != 2 || !store.ScopesAllow(scopes, store.ScopeRead) || !store.ScopesAllow(scopes, store.ScopeWrite) {
		t.Fatalf("default key should carry read+write scopes, got %v", scopes)
	}
	// last_used_at_ms is stamped after resolution.
	keys, _ := st.ListAPIKeys(context.Background(), uid)
	if len(keys) != 1 || keys[0].LastUsedAtMS == nil {
		t.Fatalf("resolve should touch last_used_at_ms: %+v", keys)
	}

	// Unknown / malformed keys fail.
	if _, _, err := a.ResolveAPIKey(context.Background(), "whk_live_deadbeef"); err == nil {
		t.Fatal("unknown key must not resolve")
	}
	if _, _, err := a.ResolveAPIKey(context.Background(), "not-a-key"); err == nil {
		t.Fatal("non-whk key must not resolve")
	}

	// Revoked key no longer resolves.
	rec = serveAs(a, uid, jsonReq(http.MethodDelete, "/api/keys/"+keyID, nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete key: %d %s", rec.Code, rec.Body.String())
	}
	if _, _, err := a.ResolveAPIKey(context.Background(), full); err == nil {
		t.Fatal("revoked key must not resolve")
	}
}

func TestActivityRecordedAndListed(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 503, "activeuser")

	// Creating an endpoint records an activity entry.
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "logme"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create endpoint: %d %s", rec.Code, rec.Body.String())
	}

	rec = serveAs(a, uid, jsonReq(http.MethodGet, "/api/activity", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list activity: %d", rec.Code)
	}
	var entries []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &entries)
	if len(entries) == 0 {
		t.Fatal("expected at least one activity entry")
	}
	if entries[0]["action"] != "endpoint.created" {
		t.Fatalf("newest action should be endpoint.created, got %v", entries[0]["action"])
	}
	if entries[0]["target"] != "logme" {
		t.Fatalf("activity target should be the endpoint name, got %v", entries[0]["target"])
	}
}

func TestDeleteAccountCascade(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 504, "goner")

	// Seed an endpoint + event + key + an activity entry.
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "e"}))
	var ep store.Endpoint
	_ = json.Unmarshal(rec.Body.Bytes(), &ep)
	ev := &store.Event{EndpointID: ep.ID, Method: "POST", RawBody: []byte("{}")}
	_ = st.CreateEvent(context.Background(), ev)
	_ = serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]string{"name": "k"}))

	// Delete the account.
	rec = serveAs(a, uid, jsonReq(http.MethodDelete, "/api/account", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete account: %d %s", rec.Code, rec.Body.String())
	}

	// Everything owned by the user is gone.
	if _, err := st.GetUser(context.Background(), uid); err == nil {
		t.Fatal("user should be deleted")
	}
	if eps, _ := st.ListEndpoints(context.Background(), uid); len(eps) != 0 {
		t.Fatalf("endpoints not cascaded: %d", len(eps))
	}
	if _, err := st.GetEvent(context.Background(), ev.ID); err == nil {
		t.Fatal("events not cascaded")
	}
	if keys, _ := st.ListAPIKeys(context.Background(), uid); len(keys) != 0 {
		t.Fatalf("api keys not cascaded: %d", len(keys))
	}
	if act, _ := st.ListActivity(context.Background(), uid, 50, 0); len(act) != 0 {
		t.Fatalf("activity not cascaded: %d", len(act))
	}
}
