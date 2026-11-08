// Package ingest is the public, untrusted capture path. It receives webhooks on
// /i/{endpointID}, stores the exact raw request, runs signature verification
// when the endpoint is configured for it, responds with the endpoint's
// configured response rule, and publishes the event to the SSE hub.
package ingest

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	"whook/internal/cryptox"
	"whook/internal/httpx"
	"whook/internal/sse"
	"whook/internal/store"
	"whook/internal/verify"
)

// Handler captures inbound webhooks.
type Handler struct {
	store      store.Store
	hub        *sse.Hub
	cipher     *cryptox.Cipher
	maxBody    int64
	endpointRL *httpx.RateLimiter
	ipRL       *httpx.RateLimiter
}

// New builds an ingest handler.
func New(st store.Store, hub *sse.Hub, cipher *cryptox.Cipher, maxBody int64, endpointRL, ipRL *httpx.RateLimiter) *Handler {
	return &Handler{store: st, hub: hub, cipher: cipher, maxBody: maxBody, endpointRL: endpointRL, ipRL: ipRL}
}

// Capture handles any method on /i/{endpointID}.
func (h *Handler) Capture(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")
	if endpointID == "" {
		httpx.Error(w, http.StatusNotFound, "unknown endpoint")
		return
	}

	// Rate limit per endpoint and per IP before any real work.
	ip := httpx.ClientIP(r)
	if !h.ipRL.Allow(ip) || !h.endpointRL.Allow(endpointID) {
		w.Header().Set("Retry-After", "1")
		httpx.Error(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	ep, err := h.store.GetEndpoint(r.Context(), endpointID)
	if err != nil {
		// Do not distinguish "not found" vs other errors to avoid probing.
		httpx.Error(w, http.StatusNotFound, "unknown endpoint")
		return
	}

	// Read the raw body with a hard size cap. We store exact bytes.
	limited := http.MaxBytesReader(w, r.Body, h.maxBody)
	body, err := io.ReadAll(limited)
	if err != nil {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "request body too large")
		return
	}

	ev := &store.Event{
		EndpointID:   endpointID,
		Method:       r.Method,
		Path:         r.URL.Path,
		Query:        r.URL.RawQuery,
		Headers:      headersToPairs(r.Header),
		RawBody:      body,
		Size:         len(body),
		ContentType:  r.Header.Get("Content-Type"),
		EventType:    deriveEventType(r.Header, r.Header.Get("Content-Type"), body),
		SourceIP:     ip,
		ReceivedAtMS: time.Now().UnixMilli(),
	}

	// Verify the signature if we can (secret configured). The full external URL
	// is reconstructed from the forwarded headers so URL-bound schemes (Twilio)
	// verify against the exact URL the sender was pointed at.
	h.runVerify(r.Context(), ep, r.Header, httpx.ExternalURL(r), body, ev)

	if err := h.store.CreateEvent(r.Context(), ev); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not store event")
		return
	}

	// Publish to live subscribers (never blocks ingest).
	h.publish(endpointID, ev)

	// Respond with the endpoint's configured response rule.
	writeResponseRule(w, ep.Response)
}

// runVerify fills the verify fields on ev using the endpoint's provider/secret.
// url is the full external URL the request was received on (for URL-bound schemes).
func (h *Handler) runVerify(ctx context.Context, ep *store.Endpoint, hdr http.Header, url string, body []byte, ev *store.Event) {
	provider := verify.Provider(ep.Provider)
	if provider == "" {
		if detected, ok := verify.Detect(hdr); ok {
			provider = detected
		}
	}
	if provider == "" {
		ev.VerifyStatus = string(verify.Unknown)
		ev.VerifyCause = string(verify.CauseUnsupported)
		ev.VerifySummary = "no provider configured or detected"
		return
	}

	encSecret, err := h.store.GetEndpointSecret(ctx, ep.ID)
	if err != nil || len(encSecret) == 0 {
		ev.VerifyStatus = string(verify.Unknown)
		ev.VerifyCause = string(verify.CauseMissingSecret)
		ev.VerifySummary = "no signing secret configured for this endpoint"
		ev.VerifyDetails = map[string]string{"provider": string(provider)}
		return
	}
	secret, err := h.cipher.DecryptString(encSecret)
	if err != nil {
		ev.VerifyStatus = string(verify.Unknown)
		ev.VerifyCause = string(verify.CauseMissingSecret)
		ev.VerifySummary = "stored secret could not be decrypted"
		return
	}

	res := verify.Verify(verify.Input{
		Provider: provider,
		Secret:   secret,
		Headers:  hdr,
		Body:     body,
		URL:      url,
	})
	ev.VerifyStatus = string(res.Status)
	ev.VerifyCause = string(res.Cause)
	ev.VerifySummary = res.Summary
	ev.VerifyDetails = res.Details
	if ev.VerifyDetails == nil {
		ev.VerifyDetails = map[string]string{}
	}
}

// publish marshals a compact event summary and sends it to SSE subscribers.
func (h *Handler) publish(endpointID string, ev *store.Event) {
	// Live stream carries status only; the verify "why" (cause/summary/details)
	// is the paid wedge and is served solely via the plan-gated event-detail
	// route, never pushed on the public-ish live channel.
	summary := map[string]any{
		"id":             ev.ID,
		"endpoint_id":    ev.EndpointID,
		"method":         ev.Method,
		"path":           ev.Path,
		"size":           ev.Size,
		"content_type":   ev.ContentType,
		"event_type":     ev.EventType,
		"source_ip":      ev.SourceIP,
		"received_at_ms": ev.ReceivedAtMS,
		"verify_status":  ev.VerifyStatus,
	}
	data, err := json.Marshal(summary)
	if err != nil {
		return
	}
	h.hub.Publish(endpointID, sse.Message{Event: "event", Data: string(data)})
}

// headersToPairs expands an http.Header into ordered name/value pairs,
// preserving duplicate values for the same header. Cross-key wire order is not
// recoverable from net/http's parsed map, so keys are emitted in a stable
// (sorted) order; duplicates for one key keep their received order.
func headersToPairs(h http.Header) []store.HeaderPair {
	keys := make([]string, 0, len(h))
	for k := range h {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var out []store.HeaderPair
	for _, k := range keys {
		for _, v := range h[k] {
			out = append(out, store.HeaderPair{Name: k, Value: v})
		}
	}
	return out
}

// maxEventTypeLen caps a derived event type to a short, display-safe length.
const maxEventTypeLen = 120

// deriveEventType produces a short, human-readable label for a captured webhook
// so the inspector can show e.g. "checkout.session.completed" instead of the
// ingest path. Precedence: a top-level JSON string field "type" (Stripe,
// Dodo/Standard-Webhooks, ...), then provider headers X-GitHub-Event,
// X-Shopify-Topic, X-Event-Name, X-Event-Type; otherwise "".
//
// It never trusts or executes captured content: the result is treated as inert
// text, stripped of control characters/newlines and length-capped. An empty
// return means "no type" and the UI falls back to the HTTP method.
func deriveEventType(headers http.Header, contentType string, body []byte) string {
	if t := jsonTopLevelType(contentType, body); t != "" {
		return sanitizeEventType(t)
	}
	for _, key := range []string{"X-GitHub-Event", "X-Shopify-Topic", "X-Event-Name", "X-Event-Type"} {
		if v := headers.Get(key); v != "" {
			if s := sanitizeEventType(v); s != "" {
				return s
			}
		}
	}
	return ""
}

// DeriveEventType exposes the capture-path derivation so other callers (e.g. the
// sample sender) label synthetic events exactly as real captures are labelled.
func DeriveEventType(headers http.Header, contentType string, body []byte) string {
	return deriveEventType(headers, contentType, body)
}

// jsonTopLevelType returns the value of a top-level string field "type" if the
// body is a JSON object with one, else "". Decoding into *string means a
// non-string "type" (number, object, array, bool) is ignored rather than
// coerced. The contentType is used only as a cheap gate; a body that looks like
// a JSON object is still parsed even if the sender mislabels it.
func jsonTopLevelType(contentType string, body []byte) string {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return ""
	}
	_ = contentType // accepted for signature stability; parse is driven by the body shape
	var probe struct {
		Type *string `json:"type"`
	}
	if err := json.Unmarshal(trimmed, &probe); err != nil || probe.Type == nil {
		return ""
	}
	return *probe.Type
}

// sanitizeEventType collapses a candidate label to a single-line, control-char-free
// string capped at maxEventTypeLen bytes (never splitting a multi-byte rune).
func sanitizeEventType(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '\t' || r == '\n' || r == '\r':
			b.WriteByte(' ') // fold whitespace/newlines to a single-line form
		case r < 0x20 || r == 0x7f:
			// drop other control characters entirely
		default:
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	if len(out) > maxEventTypeLen {
		out = out[:maxEventTypeLen]
		for len(out) > 0 && !utf8.ValidString(out) {
			out = out[:len(out)-1]
		}
		out = strings.TrimSpace(out)
	}
	return out
}

// writeResponseRule emits the endpoint's configured response to the sender.
func writeResponseRule(w http.ResponseWriter, rule store.ResponseRule) {
	status := rule.Status
	if status == 0 {
		status = 200
	}
	hasCT := false
	for k, v := range rule.Headers {
		w.Header().Set(k, v)
		if http.CanonicalHeaderKey(k) == "Content-Type" {
			hasCT = true
		}
	}
	if !hasCT {
		w.Header().Set("Content-Type", "application/json")
	}
	w.WriteHeader(status)
	_, _ = io.WriteString(w, rule.Body)
}
