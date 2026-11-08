package api

import (
	"encoding/json"
	"net/http"
	"time"

	"whook/internal/cryptox"
	"whook/internal/httpx"
	"whook/internal/ingest"
	"whook/internal/plan"
	"whook/internal/samples"
	"whook/internal/sse"
	"whook/internal/store"
	"whook/internal/verify"
)

type createEndpointReq struct {
	Name          string `json:"name"`
	Provider      string `json:"provider"`
	RetentionDays int    `json:"retention_days"`
}

// CreateEndpoint creates a new ingest endpoint owned by the caller.
func (a *API) CreateEndpoint(w http.ResponseWriter, r *http.Request) {
	var req createEndpointReq
	if err := httpx.DecodeJSON(w, r, a.MaxJSONBody, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Provider != "" && !validProvider(req.Provider) {
		httpx.Error(w, http.StatusBadRequest, "unknown provider")
		return
	}
	// Enforce the per-plan endpoint cap (free: 2, pro: 25).
	userPlan := a.userPlan(r)
	existing, err := a.Store.ListEndpoints(ctx(r), httpx.UserID(r.Context()))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not check endpoint count")
		return
	}
	if len(existing) >= plan.MaxEndpoints(userPlan) {
		writeUpgrade(w, "you have reached your plan's endpoint limit")
		return
	}
	ep := &store.Endpoint{
		OwnerID:       httpx.UserID(r.Context()),
		Name:          req.Name,
		Provider:      req.Provider,
		Response:      store.DefaultResponseRule(),
		RetentionDays: plan.ClampRetentionDays(userPlan, req.RetentionDays),
	}
	if err := a.Store.CreateEndpoint(ctx(r), ep); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create endpoint")
		return
	}
	a.recordActivity(ctx(r), ep.OwnerID, "endpoint.created", endpointLabel(ep), map[string]string{"id": ep.ID})
	httpx.JSON(w, http.StatusCreated, ep)
}

// ListEndpoints returns the caller's endpoints.
func (a *API) ListEndpoints(w http.ResponseWriter, r *http.Request) {
	eps, err := a.Store.ListEndpoints(ctx(r), httpx.UserID(r.Context()))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not list endpoints")
		return
	}
	if eps == nil {
		eps = []*store.Endpoint{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"endpoints": eps})
}

// GetEndpoint returns one endpoint the caller owns.
func (a *API) GetEndpoint(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	httpx.JSON(w, http.StatusOK, ep)
}

type updateEndpointReq struct {
	Name          *string `json:"name"`
	Provider      *string `json:"provider"`
	RetentionDays *int    `json:"retention_days"`
}

// UpdateEndpoint updates mutable fields (name/provider/retention).
func (a *API) UpdateEndpoint(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	var req updateEndpointReq
	if err := httpx.DecodeJSON(w, r, a.MaxJSONBody, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Name != nil {
		ep.Name = *req.Name
	}
	if req.Provider != nil {
		if *req.Provider != "" && !validProvider(*req.Provider) {
			httpx.Error(w, http.StatusBadRequest, "unknown provider")
			return
		}
		ep.Provider = *req.Provider
	}
	if req.RetentionDays != nil {
		ep.RetentionDays = plan.ClampRetentionDays(a.userPlan(r), *req.RetentionDays)
	}
	if err := a.Store.UpdateEndpoint(ctx(r), ep); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update endpoint")
		return
	}
	httpx.JSON(w, http.StatusOK, ep)
}

// DeleteEndpoint removes an endpoint and its events.
func (a *API) DeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	if err := a.Store.DeleteEndpoint(ctx(r), ep.ID, ep.OwnerID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete endpoint")
		return
	}
	a.recordActivity(ctx(r), ep.OwnerID, "endpoint.deleted", endpointLabel(ep), map[string]string{"id": ep.ID})
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

type secretReq struct {
	Secret string `json:"secret"`
}

// SetSecret encrypts and stores the endpoint's signing secret. The plaintext is
// never persisted or returned; only a masked form is kept for display.
func (a *API) SetSecret(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	var req secretReq
	if err := httpx.DecodeJSON(w, r, a.MaxJSONBody, &req); err != nil || req.Secret == "" {
		httpx.Error(w, http.StatusBadRequest, "a non-empty secret is required")
		return
	}
	enc, err := a.Cipher.EncryptString(req.Secret)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not encrypt secret")
		return
	}
	// "rotated" when a secret already existed, else "set" — same action string.
	if err := a.Store.SetEndpointSecret(ctx(r), ep.ID, enc, cryptox.Mask(req.Secret)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not store secret")
		return
	}
	a.recordActivity(ctx(r), ep.OwnerID, "secret.set", endpointLabel(ep), map[string]string{"rotated": boolStr(ep.HasSecret)})
	httpx.JSON(w, http.StatusOK, map[string]any{"has_secret": true, "secret_mask": cryptox.Mask(req.Secret)})
}

// ClearSecret removes a stored signing secret.
func (a *API) ClearSecret(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	if err := a.Store.SetEndpointSecret(ctx(r), ep.ID, nil, ""); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not clear secret")
		return
	}
	a.recordActivity(ctx(r), ep.OwnerID, "secret.cleared", endpointLabel(ep), nil)
	httpx.JSON(w, http.StatusOK, map[string]any{"has_secret": false})
}

// SetResponseRule configures the HTTP response the endpoint returns to senders.
func (a *API) SetResponseRule(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	if !plan.CanEditResponse(a.userPlan(r)) {
		writeUpgrade(w, "custom response rules are a Pro feature")
		return
	}
	var rule store.ResponseRule
	if err := httpx.DecodeJSON(w, r, a.MaxJSONBody, &rule); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if rule.Status < 100 || rule.Status > 599 {
		httpx.Error(w, http.StatusBadRequest, "status must be a valid HTTP status code")
		return
	}
	ep.Response = rule
	if err := a.Store.UpdateEndpoint(ctx(r), ep); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update response rule")
		return
	}
	httpx.JSON(w, http.StatusOK, ep)
}

type sampleReq struct {
	Provider string `json:"provider"`
}

// SendSample injects a realistic sample event into the endpoint. If the
// endpoint has a signing secret, the sample is signed so it verifies as PASS.
func (a *API) SendSample(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	var req sampleReq
	// Body is optional.
	_ = httpx.DecodeJSON(w, r, a.MaxJSONBody, &req)

	providerStr := req.Provider
	if providerStr == "" {
		providerStr = ep.Provider
	}
	if providerStr == "" {
		httpx.Error(w, http.StatusBadRequest, "no provider set on endpoint; specify one")
		return
	}
	provider := verify.Provider(providerStr)
	sample, ok2 := samples.For(provider)
	if !ok2 {
		httpx.Error(w, http.StatusBadRequest, "no sample template for provider")
		return
	}

	headers := []store.HeaderPair{
		{Name: "Content-Type", Value: sample.ContentType},
		{Name: "User-Agent", Value: "whook-sample-sender/1"},
	}
	for k, v := range sample.Headers {
		headers = append(headers, store.HeaderPair{Name: k, Value: v})
	}

	ev := &store.Event{
		EndpointID:   ep.ID,
		Method:       http.MethodPost,
		Path:         "/i/" + ep.ID,
		Headers:      headers,
		RawBody:      sample.Body,
		Size:         len(sample.Body),
		ContentType:  sample.ContentType,
		SourceIP:     "sample",
		ReceivedAtMS: time.Now().UnixMilli(),
	}
	// Label the synthetic event exactly as a real capture would be (e.g. the
	// sample's top-level "type" or its provider header like X-Shopify-Topic).
	ev.EventType = ingest.DeriveEventType(pairsToHeader(ev.Headers), ev.ContentType, ev.RawBody)

	// The sample's ingest URL — what a real sender (e.g. Twilio) would be pointed
	// at — so a URL-bound signature signs and verifies against the same URL.
	ingestURL := httpx.ExternalBaseURL(r) + "/i/" + ep.ID

	// Sign + verify if a secret is configured, so the demo shows a clean PASS.
	if enc, err := a.Store.GetEndpointSecret(ctx(r), ep.ID); err == nil && len(enc) > 0 {
		if secret, derr := a.Cipher.DecryptString(enc); derr == nil {
			signRes := verify.Sign(verify.SignInput{Provider: provider, Secret: secret, Body: sample.Body, URL: ingestURL})
			if signRes.Err == nil {
				for k, v := range signRes.Headers {
					headers = append(headers, store.HeaderPair{Name: k, Value: v})
				}
				ev.Headers = headers
				vres := verify.Verify(verify.Input{
					Provider: provider, Secret: secret, Headers: pairsToHeader(headers), Body: sample.Body, URL: ingestURL,
				})
				ev.VerifyStatus = string(vres.Status)
				ev.VerifyCause = string(vres.Cause)
				ev.VerifySummary = vres.Summary
				ev.VerifyDetails = vres.Details
			}
		}
	}
	if ev.VerifyStatus == "" {
		ev.VerifyStatus = string(verify.Unknown)
		ev.VerifyCause = string(verify.CauseMissingSecret)
		ev.VerifySummary = "sample sent without a signing secret configured"
	}

	if err := a.Store.CreateEvent(ctx(r), ev); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not store sample event")
		return
	}
	a.publishEvent(ep.ID, ev)
	httpx.JSON(w, http.StatusCreated, eventDetail(ev, plan.IsPro(a.userPlan(r))))
}

// publishEvent mirrors ingest's publish so samples animate the live stream too.
func (a *API) publishEvent(endpointID string, ev *store.Event) {
	// The live stream carries status only; the verify "why" is fetched via the
	// (plan-gated) event-detail route, so it is never leaked to free users here.
	data, err := json.Marshal(map[string]any{
		"id": ev.ID, "endpoint_id": ev.EndpointID, "method": ev.Method, "path": ev.Path,
		"size": ev.Size, "content_type": ev.ContentType, "event_type": ev.EventType,
		"source_ip": ev.SourceIP, "received_at_ms": ev.ReceivedAtMS, "verify_status": ev.VerifyStatus,
	})
	if err == nil {
		a.Hub.Publish(endpointID, sse.Message{Event: "event", Data: string(data)})
	}
}

func validProvider(p string) bool {
	switch verify.Provider(p) {
	case verify.Stripe, verify.GitHub, verify.Razorpay, verify.Shopify, verify.StandardWebhooks, verify.Slack, verify.Twilio, verify.Vercel:
		return true
	}
	return false
}

// endpointLabel is a short human label for the activity log (name or id).
func endpointLabel(ep *store.Endpoint) string {
	if ep.Name != "" {
		return ep.Name
	}
	return ep.ID
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func pairsToHeader(pairs []store.HeaderPair) http.Header {
	h := http.Header{}
	for _, p := range pairs {
		h.Add(p.Name, p.Value)
	}
	return h
}
