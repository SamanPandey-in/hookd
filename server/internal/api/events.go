package api

import (
	"encoding/base64"
	"net/http"

	"whook/internal/httpx"
	"whook/internal/plan"
	"whook/internal/replay"
	"whook/internal/store"
	"whook/internal/verify"
)

// ListEvents returns captured events for an endpoint with optional filters.
func (a *API) ListEvents(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	pro := plan.IsPro(a.userPlan(r))
	q := r.URL.Query()
	// Text search within bodies is Pro-only; a basic list stays free.
	if q.Get("q") != "" && !pro {
		writeUpgrade(w, "text search across event bodies is a Pro feature")
		return
	}
	f := store.EventFilter{
		Method:       q.Get("method"),
		VerifyStatus: q.Get("verify"),
		Text:         q.Get("q"),
	}
	if lim := q.Get("limit"); lim != "" {
		if n := atoiSafe(lim); n > 0 {
			f.Limit = n
		}
	}
	if before := q.Get("before"); before != "" {
		f.BeforeMS = atoi64Safe(before)
	}
	evs, err := a.Store.ListEvents(ctx(r), ep.ID, f)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not list events")
		return
	}
	out := make([]map[string]any, 0, len(evs))
	for _, ev := range evs {
		out = append(out, eventListView(ev, pro))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"events": out})
}

// GetEvent returns one event with its full body and headers.
func (a *API) GetEvent(w http.ResponseWriter, r *http.Request) {
	ev, _, ok := a.ownedEvent(w, r)
	if !ok {
		return
	}
	httpx.JSON(w, http.StatusOK, eventDetail(ev, plan.IsPro(a.userPlan(r))))
}

// GetEventBody streams the exact raw bytes of the captured body (download),
// always as an inert octet-stream / content-disposition attachment so a browser
// never renders captured HTML as live markup.
func (a *API) GetEventBody(w http.ResponseWriter, r *http.Request) {
	ev, _, ok := a.ownedEvent(w, r)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\"body-"+ev.ID+".bin\"")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(ev.RawBody)
}

type replayReq struct {
	TargetURL string `json:"target_url"`
	Resign    bool   `json:"resign"`
}

// ReplayEvent re-sends a captured event to a user-supplied target URL, optionally
// re-signing it. The attempt is always recorded.
func (a *API) ReplayEvent(w http.ResponseWriter, r *http.Request) {
	ev, ep, ok := a.ownedEvent(w, r)
	if !ok {
		return
	}
	if !plan.CanReplay(a.userPlan(r)) {
		writeUpgrade(w, "replay & re-sign is a Pro feature")
		return
	}
	var req replayReq
	if err := httpx.DecodeJSON(w, r, a.MaxJSONBody, &req); err != nil || req.TargetURL == "" {
		httpx.Error(w, http.StatusBadRequest, "target_url is required")
		return
	}

	rreq := replay.Request{Event: ev, TargetURL: req.TargetURL, Resign: req.Resign}
	if req.Resign {
		provider := verify.Provider(ep.Provider)
		if provider == "" {
			if detected, okd := verify.Detect(pairsToHeader(ev.Headers)); okd {
				provider = detected
			}
		}
		if provider == "" {
			httpx.Error(w, http.StatusBadRequest, "cannot re-sign: endpoint has no provider set")
			return
		}
		enc, serr := a.Store.GetEndpointSecret(ctx(r), ep.ID)
		if serr != nil || len(enc) == 0 {
			httpx.Error(w, http.StatusBadRequest, "cannot re-sign: endpoint has no signing secret")
			return
		}
		secret, derr := a.Cipher.DecryptString(enc)
		if derr != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not decrypt signing secret")
			return
		}
		rreq.Provider = provider
		rreq.Secret = secret
	}

	attempt, rerr := a.Replay.Replay(ctx(r), rreq)
	// Persist the attempt regardless of success (guard/transport errors included).
	if attempt != nil {
		if perr := a.Store.CreateReplayAttempt(ctx(r), attempt); perr != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not record replay attempt")
			return
		}
		a.recordActivity(ctx(r), ep.OwnerID, "replay.sent", endpointLabel(ep), map[string]string{
			"event_id":  ev.ID,
			"delivered": boolStr(rerr == nil),
		})
	}
	if rerr != nil {
		// A blocked/failed delivery is a normal, recorded outcome — return 200
		// with the attempt (which carries the error) so the UI can show it.
		httpx.JSON(w, http.StatusOK, map[string]any{"attempt": attempt, "delivered": false, "error": attempt.Error})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"attempt": attempt, "delivered": true})
}

// ListReplays returns the replay attempts for an event.
func (a *API) ListReplays(w http.ResponseWriter, r *http.Request) {
	ev, _, ok := a.ownedEvent(w, r)
	if !ok {
		return
	}
	attempts, err := a.Store.ListReplayAttempts(ctx(r), ev.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not list replay attempts")
		return
	}
	if attempts == nil {
		attempts = []*store.ReplayAttempt{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"attempts": attempts})
}

// CreateShare mints (or returns the existing) read-only share token for an event.
func (a *API) CreateShare(w http.ResponseWriter, r *http.Request) {
	ev, _, ok := a.ownedEvent(w, r)
	if !ok {
		return
	}
	if !plan.CanShare(a.userPlan(r)) {
		writeUpgrade(w, "share links are a Pro feature")
		return
	}
	token, err := a.Store.CreateShare(ctx(r), ev.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create share link")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"token": token, "path": "/share/" + token})
}

// eventDetail builds the JSON detail representation including the body. When pro
// is false the verify "why" (cause/summary/details) is omitted — the paid wedge.
func eventDetail(ev *store.Event, pro bool) map[string]any {
	m := eventListView(ev, pro)
	m["body"] = string(ev.RawBody)
	m["body_base64"] = base64.StdEncoding.EncodeToString(ev.RawBody)
	return m
}

func atoiSafe(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
		if n > 1_000_000 {
			break
		}
	}
	return n
}

func atoi64Safe(s string) int64 {
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int64(c-'0')
	}
	return n
}
