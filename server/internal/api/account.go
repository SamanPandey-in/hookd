package api

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"whook/internal/httpx"
	"whook/internal/store"
)

// This file holds the account-settings endpoints: theme sync, notification
// preferences (+ billing email), and GDPR data export. All are session-only.
//
// NOTE ON NOTIFICATIONS: this is PREFERENCE STORAGE ONLY. No outbound-email
// provider is wired in this build, so NOTHING is actually sent. The server
// records the user's intent (which emails they want, and where billing mail
// would go) so a later mail integration can honor it without a schema change.

// maxThemeLen bounds the stored theme string (the client sends a short token
// like "mono-dark"); anything longer is rejected as malformed.
const maxThemeLen = 64

type setThemeReq struct {
	Theme string `json:"theme"`
}

// SetTheme persists the caller's account-synced appearance theme.
// PUT /api/account/theme {"theme":"..."} -> {"theme":"..."}.
func (a *API) SetTheme(w http.ResponseWriter, r *http.Request) {
	var req setThemeReq
	if err := httpx.DecodeJSON(w, r, a.MaxJSONBody, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Theme = strings.TrimSpace(req.Theme)
	if len(req.Theme) > maxThemeLen {
		httpx.Error(w, http.StatusBadRequest, "theme is too long")
		return
	}
	uid := httpx.UserID(r.Context())
	if err := a.Store.UpdateUserTheme(ctx(r), uid, req.Theme); err != nil {
		if isNotFound(err) {
			httpx.Error(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "could not save theme")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"theme": req.Theme})
}

// GetNotifications returns the caller's notification preferences + billing email.
// GET /api/account/notifications.
func (a *API) GetNotifications(w http.ResponseWriter, r *http.Request) {
	u, err := a.Store.GetUser(ctx(r), httpx.UserID(r.Context()))
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	httpx.JSON(w, http.StatusOK, store.NotificationPrefs{
		BillingEmail:        u.BillingEmail,
		NotifyProduct:       u.NotifyProduct,
		NotifyCaptureAlerts: u.NotifyCaptureAlerts,
	})
}

// SetNotifications persists the caller's notification preferences + billing
// email. PUT /api/account/notifications. Delivery is DEFERRED (no mail
// provider): this only records intent.
func (a *API) SetNotifications(w http.ResponseWriter, r *http.Request) {
	var req store.NotificationPrefs
	if err := httpx.DecodeJSON(w, r, a.MaxJSONBody, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.BillingEmail = strings.TrimSpace(req.BillingEmail)
	// Light validation only: a non-empty billing email must look like an address.
	// '' is valid and means "use the login email".
	if req.BillingEmail != "" && (!strings.Contains(req.BillingEmail, "@") || len(req.BillingEmail) > 254) {
		httpx.Error(w, http.StatusBadRequest, "billing_email is not a valid email address")
		return
	}
	uid := httpx.UserID(r.Context())
	if err := a.Store.UpdateNotificationPrefs(ctx(r), uid, req); err != nil {
		if isNotFound(err) {
			httpx.Error(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "could not save notification preferences")
		return
	}
	a.recordActivity(ctx(r), uid, "notifications.updated", "", nil)
	httpx.JSON(w, http.StatusOK, req)
}

// exportEventsPerEndpoint caps how many events per endpoint the export includes
// (newest first). The store hard-caps a single list at 500; keeping the export
// bounded avoids materializing an unbounded body in memory.
const exportEventsPerEndpoint = 500

// exportDoc is the GDPR data-export envelope: the caller's own profile, their
// endpoints, and (bounded) captured events. It NEVER contains another user's
// data (everything is scoped to the authenticated user id) and never contains
// signing secrets (those are write-only ciphertext in the store).
type exportDoc struct {
	ExportedAtMS int64            `json:"exported_at_ms"`
	Profile      exportProfile    `json:"profile"`
	Endpoints    []exportEndpoint `json:"endpoints"`
}

type exportProfile struct {
	ID            int64              `json:"id"`
	Login         string             `json:"login"`
	Email         string             `json:"email"`
	Name          string             `json:"name"`
	AvatarURL     string             `json:"avatar_url"`
	CreatedAtMS   int64              `json:"created_at_ms"`
	Plan          string             `json:"plan"`
	Theme         string             `json:"theme"`
	Notifications exportNotifyPrefs  `json:"notifications"`
	Subscription  store.Subscription `json:"subscription"`
}

type exportNotifyPrefs struct {
	BillingEmail        string `json:"billing_email"`
	NotifyProduct       bool   `json:"notify_product"`
	NotifyCaptureAlerts bool   `json:"notify_capture_alerts"`
}

type exportEndpoint struct {
	Endpoint *store.Endpoint `json:"endpoint"`
	Events   []exportEvent   `json:"events"`
}

type exportEvent struct {
	Event      *store.Event `json:"event"`
	BodyBase64 string       `json:"body_base64"`
}

// ExportData streams a downloadable JSON export of the caller's own data.
// GET /api/account/export (session only).
func (a *API) ExportData(w http.ResponseWriter, r *http.Request) {
	uid := httpx.UserID(r.Context())
	u, err := a.Store.GetUser(ctx(r), uid)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	eps, err := a.Store.ListEndpoints(ctx(r), uid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not export data")
		return
	}

	doc := exportDoc{
		ExportedAtMS: time.Now().UnixMilli(),
		Profile: exportProfile{
			ID: u.ID, Login: u.Login, Email: u.Email, Name: u.Name,
			AvatarURL: u.AvatarURL, CreatedAtMS: u.CreatedAt.UnixMilli(),
			Plan: u.Plan, Theme: u.Theme,
			Notifications: exportNotifyPrefs{
				BillingEmail:        u.BillingEmail,
				NotifyProduct:       u.NotifyProduct,
				NotifyCaptureAlerts: u.NotifyCaptureAlerts,
			},
			Subscription: u.Subscription,
		},
		Endpoints: make([]exportEndpoint, 0, len(eps)),
	}

	for _, ep := range eps {
		// Scope strictly to this endpoint (which we already know the caller owns).
		evs, lerr := a.Store.ListEvents(ctx(r), ep.ID, store.EventFilter{Limit: exportEventsPerEndpoint})
		if lerr != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not export data")
			return
		}
		ee := exportEndpoint{Endpoint: ep, Events: make([]exportEvent, 0, len(evs))}
		for _, ev := range evs {
			ee.Events = append(ee.Events, exportEvent{
				Event:      ev,
				BodyBase64: base64.StdEncoding.EncodeToString(ev.RawBody),
			})
		}
		doc.Endpoints = append(doc.Endpoints, ee)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="hookd-export.json"`)
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(doc)
}
