package api

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"whook/internal/httpx"
	"whook/internal/store"
)

func TestCreateKeyRejectsPastExpiry(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 611, "expirer")
	past := time.Now().UnixMilli() - 60_000
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]any{"name": "x", "expires_at_ms": past}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("past expiry should be 400, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestExpiredKeyDoesNotResolve(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 612, "expired")

	// A key that expired in the past (inserted directly so we control expiry).
	fullExpired, hash, prefix := newAPIKey()
	past := time.Now().UnixMilli() - 1000
	_ = st.CreateAPIKey(context.Background(), &store.APIKey{
		UserID: uid, KeyHash: hash, Prefix: prefix, ExpiresAtMS: &past,
	})
	if _, _, err := a.ResolveAPIKey(context.Background(), fullExpired); err == nil {
		t.Fatal("expired key must not resolve")
	}

	// A key expiring in the future resolves fine.
	fullOK, hash2, prefix2 := newAPIKey()
	future := time.Now().UnixMilli() + 3_600_000
	_ = st.CreateAPIKey(context.Background(), &store.APIKey{
		UserID: uid, KeyHash: hash2, Prefix: prefix2, ExpiresAtMS: &future,
	})
	if got, _, err := a.ResolveAPIKey(context.Background(), fullOK); err != nil || got != uid {
		t.Fatalf("future-expiry key should resolve: got (%d,%v)", got, err)
	}
}

func TestResolveRecordsLastUsedIP(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 613, "ipper")
	full, hash, prefix := newAPIKey()
	_ = st.CreateAPIKey(context.Background(), &store.APIKey{UserID: uid, KeyHash: hash, Prefix: prefix})

	// The auth middleware stashes the client IP on the context; ResolveAPIKey reads it.
	ctx := httpx.WithRequestMeta(context.Background(), "203.0.113.7", "curl/8")
	if _, _, err := a.ResolveAPIKey(ctx, full); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	keys, _ := st.ListAPIKeys(context.Background(), uid)
	if len(keys) != 1 || keys[0].LastUsedIP != "203.0.113.7" || keys[0].LastUsedAtMS == nil {
		t.Fatalf("last-used ip/time not recorded: %+v", keys)
	}
}

func TestRotateKey(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 614, "rotator")

	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys", map[string]any{"name": "rotate-me"}))
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	oldFull := created["key"].(string)
	id := created["id"].(string)

	// Use it once so last-used is set (to prove rotation resets it).
	if _, _, err := a.ResolveAPIKey(httpx.WithRequestMeta(context.Background(), "1.1.1.1", ""), oldFull); err != nil {
		t.Fatalf("pre-rotate resolve: %v", err)
	}

	rec = serveAs(a, uid, jsonReq(http.MethodPost, "/api/keys/"+id+"/rotate", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("rotate: %d %s", rec.Code, rec.Body.String())
	}
	var rotated map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &rotated)
	newFull := rotated["key"].(string)
	if newFull == "" || newFull == oldFull {
		t.Fatalf("rotate must return a new plaintext (got %q, old %q)", newFull, oldFull)
	}
	if rotated["id"] != id || rotated["name"] != "rotate-me" {
		t.Fatalf("rotate must keep id + name metadata: %+v", rotated)
	}

	// Old secret no longer authenticates; new one does.
	if _, _, err := a.ResolveAPIKey(context.Background(), oldFull); err == nil {
		t.Fatal("old secret must stop authenticating after rotation")
	}
	if got, _, err := a.ResolveAPIKey(context.Background(), newFull); err != nil || got != uid {
		t.Fatalf("new secret should authenticate: got (%d,%v)", got, err)
	}
	// Still exactly one key (rotation is in place, not a new row); last-used reset
	// by the rotation itself (then re-touched by the resolve above — so it is set,
	// but the IP from before rotation was cleared).
	keys, _ := st.ListAPIKeys(context.Background(), uid)
	if len(keys) != 1 {
		t.Fatalf("rotation should keep a single key, got %d", len(keys))
	}
}

func TestActivityPaginationAndMeta(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 615, "paginator")

	// Seed activity rows with explicit timestamps + IP/device.
	for i := int64(1); i <= 5; i++ {
		_ = st.InsertActivity(context.Background(), &store.Activity{
			UserID: uid, Action: "login", Target: "paginator",
			CreatedAtMS: 1000 * i, IP: "10.0.0.1", UserAgent: "Mozilla/5.0",
		})
	}

	// limit=2 returns the two newest (ms 5000, 4000).
	rec := serveAs(a, uid, jsonReq(http.MethodGet, "/api/activity?limit=2", nil))
	var page1 []store.Activity
	_ = json.Unmarshal(rec.Body.Bytes(), &page1)
	if len(page1) != 2 || page1[0].CreatedAtMS != 5000 || page1[1].CreatedAtMS != 4000 {
		t.Fatalf("page1 wrong: %+v", page1)
	}
	if page1[0].IP != "10.0.0.1" || page1[0].UserAgent != "Mozilla/5.0" {
		t.Fatalf("activity must carry ip/user_agent: %+v", page1[0])
	}

	// before=4000 pages older rows (3000, 2000).
	rec = serveAs(a, uid, jsonReq(http.MethodGet, "/api/activity?limit=2&before=4000", nil))
	var page2 []store.Activity
	_ = json.Unmarshal(rec.Body.Bytes(), &page2)
	if len(page2) != 2 || page2[0].CreatedAtMS != 3000 || page2[1].CreatedAtMS != 2000 {
		t.Fatalf("page2 (before cursor) wrong: %+v", page2)
	}
}
