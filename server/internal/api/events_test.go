package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"whook/internal/store"
)

// proEndpointWithSecret seeds a Pro user owning a stripe endpoint with a signing
// secret and one captured event, returning the uid, endpoint id and event id.
func proEndpointWithSecret(t *testing.T, a *API, st *store.Fake, body []byte) (uid int64, epID, evID string) {
	t.Helper()
	uid = proUser(t, st)

	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/endpoints",
		map[string]any{"name": "e", "provider": "stripe"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create endpoint: %d %s", rec.Code, rec.Body.String())
	}
	var ep store.Endpoint
	_ = json.Unmarshal(rec.Body.Bytes(), &ep)

	// Store an encrypted signing secret directly so the re-sign path has one.
	enc, err := a.Cipher.EncryptString("whsec_edit_replay_secret")
	if err != nil {
		t.Fatalf("encrypt secret: %v", err)
	}
	if err := st.SetEndpointSecret(context.Background(), ep.ID, enc, "whsec_…"); err != nil {
		t.Fatalf("set secret: %v", err)
	}

	ev := &store.Event{EndpointID: ep.ID, Method: http.MethodPost, RawBody: body}
	if err := st.CreateEvent(context.Background(), ev); err != nil {
		t.Fatalf("create event: %v", err)
	}
	return uid, ep.ID, ev.ID
}

// TestReplayEditedBodyRequiresResign: editing the body without re-sign is a 400
// (the original signature can never validate an edited body).
func TestReplayEditedBodyRequiresResign(t *testing.T) {
	a, st := newAPI(t)
	uid, _, evID := proEndpointWithSecret(t, a, st, []byte(`{"amount":100}`))

	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/events/"+evID+"/replay", map[string]any{
		"target_url": "https://example.com",
		"resign":     false,
		"body":       `{"amount":99999}`,
	}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("edited body without re-sign must be 400, got %d %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("enable re-sign")) {
		t.Fatalf("400 must explain that editing requires re-sign, got %s", rec.Body.String())
	}
}

// TestReplayEditedBodyOversizeRejected: an edited body larger than the cap is 400.
func TestReplayEditedBodyOversizeRejected(t *testing.T) {
	a, st := newAPI(t)
	uid, _, evID := proEndpointWithSecret(t, a, st, []byte(`{"amount":100}`))

	huge := strings.Repeat("x", maxEditedReplayBody+1)
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/events/"+evID+"/replay", map[string]any{
		"target_url": "https://example.com",
		"resign":     true,
		"body":       huge,
	}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("oversize edited body must be 400, got %d %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("1 MiB")) {
		t.Fatalf("400 must mention the size limit, got %s", rec.Body.String())
	}
}

// TestReplayEditedBodyNeverMutatesStoredEvent: an edited replay (even one blocked
// by the SSRF guard) must leave the captured event byte-for-byte unchanged.
func TestReplayEditedBodyNeverMutatesStoredEvent(t *testing.T) {
	a, st := newAPI(t)
	const originalBody = `{"amount":100}`
	uid, _, evID := proEndpointWithSecret(t, a, st, []byte(originalBody))

	// Edited + re-sign to a blocked (loopback-ish private) target: the handler
	// builds the edited request and hands it to replay, which blocks it. The
	// attempt is recorded (200, delivered:false) and the stored event is untouched.
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/events/"+evID+"/replay", map[string]any{
		"target_url": "http://10.0.0.1/x",
		"resign":     true,
		"body":       `{"amount":99999}`,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("blocked edited replay returns 200 with recorded attempt, got %d %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"delivered":false`)) {
		t.Errorf("blocked replay should report delivered:false, got %s", rec.Body.String())
	}

	got, err := st.GetEvent(context.Background(), evID)
	if err != nil {
		t.Fatalf("get event: %v", err)
	}
	if string(got.RawBody) != originalBody {
		t.Fatalf("stored event body was mutated by an edited replay: %q != %q", got.RawBody, originalBody)
	}
}
