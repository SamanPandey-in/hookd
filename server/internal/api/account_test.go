package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"whook/internal/store"
)

func TestSetThemePersists(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 601, "themer")

	rec := serveAs(a, uid, jsonReq(http.MethodPut, "/api/account/theme", map[string]string{"theme": "mono-dark"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("set theme: %d %s", rec.Code, rec.Body.String())
	}
	u, _ := st.GetUser(context.Background(), uid)
	if u.Theme != "mono-dark" {
		t.Fatalf("theme not persisted, got %q", u.Theme)
	}

	// Over-long theme rejected.
	long := make([]byte, maxThemeLen+1)
	for i := range long {
		long[i] = 'x'
	}
	rec = serveAs(a, uid, jsonReq(http.MethodPut, "/api/account/theme", map[string]string{"theme": string(long)}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("over-long theme should be 400, got %d", rec.Code)
	}
}

func TestNotificationPrefsRoundTrip(t *testing.T) {
	a, st := newAPI(t)
	uid := seedUser(t, st, 602, "notifier")

	// Default: notify_product true (mirrors DB default), capture alerts false.
	rec := serveAs(a, uid, jsonReq(http.MethodGet, "/api/account/notifications", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("get notifications: %d %s", rec.Code, rec.Body.String())
	}
	var prefs store.NotificationPrefs
	_ = json.Unmarshal(rec.Body.Bytes(), &prefs)
	if !prefs.NotifyProduct || prefs.NotifyCaptureAlerts || prefs.BillingEmail != "" {
		t.Fatalf("unexpected defaults: %+v", prefs)
	}

	// Update.
	rec = serveAs(a, uid, jsonReq(http.MethodPut, "/api/account/notifications", map[string]any{
		"billing_email": "billing@example.com", "notify_product": false, "notify_capture_alerts": true,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("set notifications: %d %s", rec.Code, rec.Body.String())
	}
	rec = serveAs(a, uid, jsonReq(http.MethodGet, "/api/account/notifications", nil))
	_ = json.Unmarshal(rec.Body.Bytes(), &prefs)
	if prefs.BillingEmail != "billing@example.com" || prefs.NotifyProduct || !prefs.NotifyCaptureAlerts {
		t.Fatalf("prefs not updated: %+v", prefs)
	}

	// Invalid billing email rejected.
	rec = serveAs(a, uid, jsonReq(http.MethodPut, "/api/account/notifications", map[string]any{"billing_email": "nope"}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid billing email should be 400, got %d", rec.Code)
	}
}

func TestDataExportScopedToCaller(t *testing.T) {
	a, st := newAPI(t)
	uidA := seedUser(t, st, 603, "alice")
	uidB := seedUser(t, st, 604, "bob")

	// Alice's endpoint + event.
	recA := serveAs(a, uidA, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "alice-ep"}))
	var epA store.Endpoint
	_ = json.Unmarshal(recA.Body.Bytes(), &epA)
	_ = st.CreateEvent(context.Background(), &store.Event{EndpointID: epA.ID, Method: "POST", RawBody: []byte(`{"who":"alice"}`)})

	// Bob's endpoint + event (must NOT appear in Alice's export).
	recB := serveAs(a, uidB, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "bob-ep"}))
	var epB store.Endpoint
	_ = json.Unmarshal(recB.Body.Bytes(), &epB)
	_ = st.CreateEvent(context.Background(), &store.Event{EndpointID: epB.ID, Method: "POST", RawBody: []byte(`{"who":"bob"}`)})

	rec := serveAs(a, uidA, jsonReq(http.MethodGet, "/api/account/export", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("export: %d %s", rec.Code, rec.Body.String())
	}
	if cd := rec.Header().Get("Content-Disposition"); cd == "" {
		t.Fatal("export must be served as an attachment")
	}
	body := rec.Body.String()
	if !strings.Contains(body, "alice-ep") || !strings.Contains(body, "alice") {
		t.Fatal("export should contain the caller's own data")
	}
	if strings.Contains(body, "bob-ep") || strings.Contains(body, epB.ID) || strings.Contains(body, "bob") {
		t.Fatal("export leaked another user's data")
	}
	// The body is included base64-encoded (GDPR completeness).
	var doc exportDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatalf("export is not valid JSON: %v", err)
	}
	if doc.Profile.Login != "alice" || len(doc.Endpoints) != 1 {
		t.Fatalf("unexpected export shape: profile=%s endpoints=%d", doc.Profile.Login, len(doc.Endpoints))
	}
	if len(doc.Endpoints[0].Events) != 1 || doc.Endpoints[0].Events[0].BodyBase64 == "" {
		t.Fatalf("export event body missing: %+v", doc.Endpoints[0].Events)
	}
}
