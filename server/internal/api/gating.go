package api

import (
	"net/http"

	"whook/internal/httpx"
	"whook/internal/plan"
	"whook/internal/store"
)

// userPlan returns the authenticated user's plan ("free" by default). A lookup
// failure degrades safely to free — gating never fails open.
func (a *API) userPlan(r *http.Request) string {
	u, err := a.Store.GetUser(ctx(r), httpx.UserID(r.Context()))
	if err != nil {
		return plan.Free
	}
	return plan.Normalize(u.Plan)
}

// writeUpgrade sends the 402 upgrade envelope used for every Pro-gated action.
func writeUpgrade(w http.ResponseWriter, msg string) {
	httpx.JSON(w, http.StatusPaymentRequired, map[string]any{"error": msg, "upgrade": true})
}

// eventListView is the list/summary shape of an event. The verify "why"
// (cause/summary/details) is the paid wedge: it is omitted entirely for free
// users, who see only the pass/fail/unknown status.
func eventListView(ev *store.Event, pro bool) map[string]any {
	m := map[string]any{
		"id":             ev.ID,
		"endpoint_id":    ev.EndpointID,
		"method":         ev.Method,
		"path":           ev.Path,
		"query":          ev.Query,
		"headers":        ev.Headers,
		"size":           ev.Size,
		"content_type":   ev.ContentType,
		"event_type":     ev.EventType,
		"source_ip":      ev.SourceIP,
		"received_at_ms": ev.ReceivedAtMS,
		"verify_status":  ev.VerifyStatus,
	}
	if pro {
		m["verify_cause"] = ev.VerifyCause
		m["verify_summary"] = ev.VerifySummary
		m["verify_details"] = nonNilDetails(ev.VerifyDetails)
	}
	return m
}

func nonNilDetails(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}
