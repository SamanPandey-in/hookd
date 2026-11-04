package store

import (
	"context"
	"os"
	"testing"
	"time"

	"whook/migrations"
)

// These tests hit a real Postgres and are skipped unless DATABASE_URL is set,
// so `go test ./...` is green without a database.
func newTestPG(t *testing.T) *Postgres {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set; skipping Postgres integration test")
	}
	ctx := context.Background()
	pg, err := NewPostgres(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := Migrate(ctx, pg.Pool(), migrations.FS); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return pg
}

func TestPGFullFlow(t *testing.T) {
	pg := newTestPG(t)
	defer pg.Close()
	ctx := context.Background()

	u, err := pg.UpsertUserByGitHub(ctx, time.Now().UnixNano(), "octocat", "o@x.com")
	if err != nil {
		t.Fatalf("upsert user: %v", err)
	}

	ep := &Endpoint{OwnerID: u.ID, Name: "integration", Provider: "stripe"}
	if err := pg.CreateEndpoint(ctx, ep); err != nil {
		t.Fatalf("create endpoint: %v", err)
	}
	if ep.ID == "" {
		t.Fatal("endpoint id not generated")
	}

	// Secret round trip (ciphertext bytes are opaque here).
	if err := pg.SetEndpointSecret(ctx, ep.ID, []byte{1, 2, 3, 4}, "whs…••••"); err != nil {
		t.Fatalf("set secret: %v", err)
	}
	enc, err := pg.GetEndpointSecret(ctx, ep.ID)
	if err != nil || len(enc) != 4 {
		t.Fatalf("get secret: %v len=%d", err, len(enc))
	}

	ev := &Event{
		EndpointID:    ep.ID,
		Method:        "POST",
		Path:          "/i/" + ep.ID,
		Query:         "a=1",
		Headers:       []HeaderPair{{Name: "X-Dup", Value: "1"}, {Name: "X-Dup", Value: "2"}},
		RawBody:       []byte(`{"needle":true}`),
		Size:          15,
		ContentType:   "application/json",
		ReceivedAtMS:  time.Now().UnixMilli(),
		VerifyStatus:  "pass",
		VerifyCause:   "ok",
		VerifyDetails: map[string]string{"scheme": "v1"},
	}
	if err := pg.CreateEvent(ctx, ev); err != nil {
		t.Fatalf("create event: %v", err)
	}

	got, err := pg.GetEvent(ctx, ev.ID)
	if err != nil {
		t.Fatalf("get event: %v", err)
	}
	if string(got.RawBody) != `{"needle":true}` {
		t.Errorf("body mismatch: %q", got.RawBody)
	}
	if len(got.Headers) != 2 {
		t.Errorf("headers/dupes not preserved: %+v", got.Headers)
	}

	// Text search.
	found, err := pg.ListEvents(ctx, ep.ID, EventFilter{Text: "needle"})
	if err != nil || len(found) != 1 {
		t.Fatalf("text search: %v n=%d", err, len(found))
	}
	none, _ := pg.ListEvents(ctx, ep.ID, EventFilter{Text: "haystack-absent"})
	if len(none) != 0 {
		t.Errorf("text search false positive: %d", len(none))
	}

	// Share.
	token, err := pg.CreateShare(ctx, ev.ID)
	if err != nil || token == "" {
		t.Fatalf("create share: %v", err)
	}
	// Idempotent: same token returned.
	token2, _ := pg.CreateShare(ctx, ev.ID)
	if token2 != token {
		t.Errorf("share token not idempotent: %q vs %q", token, token2)
	}
	shared, err := pg.GetEventByShareToken(ctx, token)
	if err != nil || shared.ID != ev.ID {
		t.Fatalf("get by share token: %v", err)
	}

	// Replay attempt.
	att := &ReplayAttempt{EventID: ev.ID, TargetURL: "https://example.com", ResponseStatus: 200, ResponseHeaders: map[string]string{"X": "y"}}
	if err := pg.CreateReplayAttempt(ctx, att); err != nil {
		t.Fatalf("create attempt: %v", err)
	}
	atts, err := pg.ListReplayAttempts(ctx, ev.ID)
	if err != nil || len(atts) != 1 {
		t.Fatalf("list attempts: %v n=%d", err, len(atts))
	}

	// Cleanup.
	if err := pg.DeleteEndpoint(ctx, ep.ID, u.ID); err != nil {
		t.Fatalf("delete endpoint: %v", err)
	}
}

func TestPGProfileKeysActivityAndDeleteAccount(t *testing.T) {
	pg := newTestPG(t)
	defer pg.Close()
	ctx := context.Background()

	u, err := pg.UpsertUserByGitHub(ctx, time.Now().UnixNano(), "octo", "octo@x.com")
	if err != nil {
		t.Fatalf("upsert user: %v", err)
	}

	// Profile round-trip.
	if err := pg.UpdateUserProfile(ctx, u.ID, "https://a/x.png", "Octo Cat"); err != nil {
		t.Fatalf("update profile: %v", err)
	}
	got, err := pg.GetUser(ctx, u.ID)
	if err != nil || got.AvatarURL != "https://a/x.png" || got.Name != "Octo Cat" {
		t.Fatalf("profile not persisted: %+v err=%v", got, err)
	}

	// API key CRUD + lookup + touch.
	k := &APIKey{UserID: u.ID, Name: "ci", KeyHash: "hash-" + NewToken(8), Prefix: "whk_live_3f"}
	if err := pg.CreateAPIKey(ctx, k); err != nil {
		t.Fatalf("create key: %v", err)
	}
	if k.ID == "" || k.CreatedAtMS == 0 {
		t.Fatal("key id/created not set")
	}
	keys, err := pg.ListAPIKeys(ctx, u.ID)
	if err != nil || len(keys) != 1 || keys[0].LastUsedAtMS != nil {
		t.Fatalf("list keys: %v n=%d (last_used should be nil)", err, len(keys))
	}
	found, err := pg.LookupAPIKeyByHash(ctx, k.KeyHash)
	if err != nil || found.ID != k.ID || found.UserID != u.ID {
		t.Fatalf("lookup by hash: %v %+v", err, found)
	}
	if err := pg.TouchAPIKey(ctx, k.ID, time.Now().UnixMilli()); err != nil {
		t.Fatalf("touch: %v", err)
	}
	keys, _ = pg.ListAPIKeys(ctx, u.ID)
	if keys[0].LastUsedAtMS == nil {
		t.Fatal("touch did not set last_used_at_ms")
	}
	if _, err := pg.LookupAPIKeyByHash(ctx, "nope"); err != ErrNotFound {
		t.Fatalf("unknown hash should be ErrNotFound, got %v", err)
	}

	// Activity insert + list (newest first).
	for _, act := range []string{"login", "endpoint.created", "key.created"} {
		if err := pg.InsertActivity(ctx, &Activity{UserID: u.ID, Action: act, Target: "t",
			Metadata: map[string]string{"k": "v"}}); err != nil {
			t.Fatalf("insert activity %s: %v", act, err)
		}
	}
	acts, err := pg.ListActivity(ctx, u.ID, 50)
	if err != nil || len(acts) != 3 {
		t.Fatalf("list activity: %v n=%d", err, len(acts))
	}
	if acts[0].Action != "key.created" || acts[0].Metadata["k"] != "v" {
		t.Fatalf("activity ordering/metadata wrong: %+v", acts[0])
	}

	// An endpoint + event so the cascade has something to remove.
	ep := &Endpoint{OwnerID: u.ID, Name: "casc"}
	_ = pg.CreateEndpoint(ctx, ep)
	_ = pg.CreateEvent(ctx, &Event{EndpointID: ep.ID, Method: "POST", RawBody: []byte("{}"),
		Size: 2, ReceivedAtMS: time.Now().UnixMilli()})

	// Delete account cascades everything.
	if err := pg.DeleteAccount(ctx, u.ID); err != nil {
		t.Fatalf("delete account: %v", err)
	}
	if _, err := pg.GetUser(ctx, u.ID); err != ErrNotFound {
		t.Fatalf("user should be gone, got %v", err)
	}
	if ks, _ := pg.ListAPIKeys(ctx, u.ID); len(ks) != 0 {
		t.Fatalf("keys not cascaded: %d", len(ks))
	}
	if as, _ := pg.ListActivity(ctx, u.ID, 50); len(as) != 0 {
		t.Fatalf("activity not cascaded: %d", len(as))
	}
	if eps, _ := pg.ListEndpoints(ctx, u.ID); len(eps) != 0 {
		t.Fatalf("endpoints not cascaded: %d", len(eps))
	}
}
