package api

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"whook/internal/dodo"
	"whook/internal/email"
	"whook/internal/httpx"
	"whook/internal/plan"
	"whook/internal/store"
	"whook/internal/verify"
)

// Billing wires the Dodo Payments checkout + customer-portal endpoints and the
// incoming Dodo webhook. It is constructed in package app.
//
// Dodo signs its webhooks with the Standard Webhooks spec, so we verify them
// with our OWN verify engine (verify.StandardWebhooks) — dogfooding the product.
type Billing struct {
	Store       store.Store
	Dodo        dodo.Client   // nil when DODO_API_KEY is unset (billing not configured)
	Email       email.Sender  // transactional sender; inert (no-op) unless SMTP configured
	MaxJSONBody int64

	WebhookSecret  string // DODO_WEBHOOK_SECRET; "" => /webhooks/dodo returns 503
	ProductMonthly string
	ProductAnnual  string
	SuccessURL     string
	CancelURL      string
}

type checkoutReq struct {
	Plan     string `json:"plan"`
	Interval string `json:"interval"` // "monthly" | "annual"
}

// Checkout (authed) creates a Dodo hosted-checkout session for the Pro plan and
// returns its redirect URL. It ensures the user has an associated Dodo customer
// so later webhooks + the portal can be tied back to this account.
func (b *Billing) Checkout(w http.ResponseWriter, r *http.Request) {
	if b.Dodo == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "billing not configured")
		return
	}
	var req checkoutReq
	if err := httpx.DecodeJSON(w, r, b.MaxJSONBody, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if plan.Normalize(req.Plan) != plan.Pro {
		httpx.Error(w, http.StatusBadRequest, "unknown plan (only \"pro\" is purchasable)")
		return
	}
	productID := b.ProductMonthly
	switch req.Interval {
	case "", "monthly":
		productID = b.ProductMonthly
	case "annual":
		productID = b.ProductAnnual
	default:
		httpx.Error(w, http.StatusBadRequest, "interval must be \"monthly\" or \"annual\"")
		return
	}
	if productID == "" {
		httpx.Error(w, http.StatusServiceUnavailable, "billing not configured for this interval")
		return
	}

	uid := httpx.UserID(r.Context())
	u, err := b.Store.GetUser(ctx(r), uid)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	// Ensure a Dodo customer exists for this user (stable mapping for webhooks + portal).
	customerID := u.DodoCustomerID
	if customerID == "" {
		customerID, err = b.Dodo.CreateCustomer(ctx(r), u.Email, u.Login)
		if err != nil {
			httpx.Error(w, http.StatusBadGateway, "could not create billing customer")
			return
		}
		if serr := b.Store.SetUserDodoCustomer(ctx(r), uid, customerID); serr != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not save billing customer")
			return
		}
	}

	checkoutURL, err := b.Dodo.CreateCheckoutSession(ctx(r), dodo.CheckoutInput{
		CustomerID: customerID,
		ProductID:  productID,
		ReturnURL:  b.SuccessURL,
		Metadata:   map[string]string{"whook_user_id": strconv.FormatInt(uid, 10)},
	})
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "could not start checkout")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"checkout_url": checkoutURL})
}

// Portal (authed) returns a Dodo customer-portal link for the signed-in user.
func (b *Billing) Portal(w http.ResponseWriter, r *http.Request) {
	if b.Dodo == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "billing not configured")
		return
	}
	uid := httpx.UserID(r.Context())
	u, err := b.Store.GetUser(ctx(r), uid)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if u.DodoCustomerID == "" {
		httpx.Error(w, http.StatusConflict, "no subscription")
		return
	}
	link, err := b.Dodo.CreatePortalSession(ctx(r), u.DodoCustomerID)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "could not open billing portal")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"portal_url": link})
}

// dodoWebhook is the subset of Dodo's Standard-Webhooks payload we read.
// Top-level: type, business_id, timestamp (ISO8601), data.
type dodoWebhook struct {
	Type string `json:"type"`
	Data struct {
		PayloadType             string            `json:"payload_type"`
		SubscriptionID          string            `json:"subscription_id"`
		Status                  string            `json:"status"`
		NextBillingDate         string            `json:"next_billing_date"`
		CancelAtNextBillingDate bool              `json:"cancel_at_next_billing_date"`
		Metadata                map[string]string `json:"metadata"`
		Customer                struct {
			CustomerID string `json:"customer_id"`
		} `json:"customer"`
	} `json:"data"`
}

// Webhook (PUBLIC) handles Dodo's subscription/payment webhooks. It verifies the
// Standard-Webhooks signature with our own engine, dedupes by webhook-id, maps
// the event to the user's plan+subscription state, and returns 200 fast. The raw
// body is NEVER logged.
func (b *Billing) Webhook(w http.ResponseWriter, r *http.Request) {
	if b.WebhookSecret == "" {
		httpx.Error(w, http.StatusServiceUnavailable, "billing not configured")
		return
	}
	// Read the raw bytes exactly (signature is over the raw body).
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, b.MaxJSONBody))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "could not read body")
		return
	}

	// Verify with our OWN engine — the dogfood story.
	res := verify.Verify(verify.Input{
		Provider: verify.StandardWebhooks,
		Secret:   b.WebhookSecret,
		Headers:  r.Header,
		Body:     raw,
	})
	if res.Status != verify.Pass {
		// Invalid signature (or missing headers): reject and do nothing.
		httpx.Error(w, http.StatusBadRequest, "invalid webhook signature")
		return
	}

	// Idempotency: the Standard-Webhooks id dedupes at-least-once delivery.
	webhookID := strings.TrimSpace(r.Header.Get("Webhook-Id"))
	if webhookID != "" {
		inserted, merr := b.Store.MarkWebhookProcessed(ctx(r), webhookID)
		if merr != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not record webhook")
			return
		}
		if !inserted {
			// Already handled — ack without re-applying.
			httpx.JSON(w, http.StatusOK, map[string]string{"status": "duplicate"})
			return
		}
	}

	var ev dodoWebhook
	if jerr := json.Unmarshal(raw, &ev); jerr != nil {
		// Verified but unparseable — ack so Dodo stops retrying; nothing to apply.
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}

	if applied := b.apply(r, ev); !applied {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// apply maps a verified Dodo event to a plan+subscription update. Returns false
// when the event is not a subscription/payment state change we act on, or the
// owning user cannot be found (both are acked 200, nothing to do).
func (b *Billing) apply(r *http.Request, ev dodoWebhook) bool {
	status := statusFromEvent(ev.Type, ev.Data.Status)
	if status == "" {
		return false // not a lifecycle event we track
	}
	u := b.findUser(r, ev)
	if u == nil {
		return false
	}
	sub := store.Subscription{
		ID:                ev.Data.SubscriptionID,
		Status:            status,
		CurrentPeriodEnd:  parseMS(ev.Data.NextBillingDate),
		CancelAtPeriodEnd: ev.Data.CancelAtNextBillingDate,
	}
	// Preserve the last known period-end if this event omits next_billing_date
	// (e.g. a cancellation/expiry payload).
	if sub.CurrentPeriodEnd == 0 {
		sub.CurrentPeriodEnd = u.Subscription.CurrentPeriodEnd
	}
	// Capture the prior status BEFORE the update so we can detect a transition
	// into a dunning (payment-failing) state.
	prevStatus := u.Subscription.Status

	newPlan := planForStatus(status)
	if err := b.Store.UpdateUserSubscription(ctx(r), u.ID, newPlan, sub); err != nil {
		return false
	}
	// Record the plan change in the activity log (best-effort; never blocks).
	_ = b.Store.InsertActivity(ctx(r), &store.Activity{
		UserID: u.ID, Action: "plan.changed", Target: newPlan,
		Metadata: map[string]string{"status": status, "event": ev.Type},
	})

	// Dunning notice: when the subscription TRANSITIONS into a payment-failing
	// state, best-effort email the user to update their card. Only on the
	// transition (not every webhook), never blocking the webhook response, and
	// never fatal. Delivery is inert unless SMTP is configured (see internal/email).
	b.maybeNotifyDunning(prevStatus, status, u)
	return true
}

// dunningStatuses are the subscription states that mean a renewal charge is
// failing and the user must update their payment method.
func isDunning(status string) bool {
	switch status {
	case "past_due", "on_hold", "failed":
		return true
	default:
		return false
	}
}

// maybeNotifyDunning sends the "your payment is failing" email, but ONLY on the
// transition INTO a dunning state (prev not dunning, new dunning) so a user is
// not re-notified on every retry webhook. Dunning is transactional, so it is
// always attempted when a sender is configured (the no-op sender makes it inert
// without SMTP). The send runs in the background with its own context so it never
// blocks or fails the webhook response; failures are logged, not fatal.
func (b *Billing) maybeNotifyDunning(prevStatus, newStatus string, u *store.User) {
	if b.Email == nil || u == nil {
		return
	}
	if !isDunning(newStatus) || isDunning(prevStatus) {
		return // not a fresh transition into dunning
	}
	to := strings.TrimSpace(u.BillingEmail)
	if to == "" {
		to = strings.TrimSpace(u.Email) // fall back to the login email
	}
	if to == "" {
		return // nowhere to send
	}
	msg := email.Message{
		To:      to,
		Subject: "your hookd payment is failing — update your card",
		Body: "hi,\n\n" +
			"we couldn't process the latest charge for your hookd Pro subscription, " +
			"so your account is now past due.\n\n" +
			"please update your payment method to keep Pro features active:\n" +
			"https://hookd.dev/app/settings/billing\n\n" +
			"if the charge succeeds on a retry, you can ignore this message.\n\n" +
			"— hookd\n",
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := b.Email.Send(ctx, msg); err != nil {
			log.Printf("billing: dunning email send failed (non-fatal): %v", err)
		}
	}()
}

// findUser resolves the owning user from the Dodo customer id, falling back to
// the whook_user_id we stamped in checkout metadata.
func (b *Billing) findUser(r *http.Request, ev dodoWebhook) *store.User {
	if cid := ev.Data.Customer.CustomerID; cid != "" {
		if u, err := b.Store.GetUserByDodoCustomerID(ctx(r), cid); err == nil {
			return u
		}
	}
	if raw := ev.Data.Metadata["whook_user_id"]; raw != "" {
		if id := atoi64Safe(raw); id > 0 {
			if u, err := b.Store.GetUser(ctx(r), id); err == nil {
				return u
			}
		}
	}
	return nil
}

// statusFromEvent determines the effective subscription status. It trusts the
// payload's own status when present, else infers one from the event type. An
// empty return means "not a subscription-lifecycle event we track".
func statusFromEvent(evType, dataStatus string) string {
	// payment.succeeded carrying a subscription is a renewal/recovery -> active.
	switch evType {
	case "subscription.active", "subscription.renewed", "subscription.plan_changed",
		"subscription.on_hold", "subscription.past_due",
		"subscription.cancelled", "subscription.expired", "subscription.failed",
		"payment.succeeded":
		// handled below
	default:
		return ""
	}
	if dataStatus != "" {
		return dataStatus
	}
	switch evType {
	case "subscription.active", "subscription.renewed", "subscription.plan_changed", "payment.succeeded":
		return "active"
	case "subscription.on_hold", "subscription.past_due":
		return "on_hold"
	case "subscription.cancelled":
		return "cancelled"
	case "subscription.expired":
		return "expired"
	case "subscription.failed":
		return "failed"
	}
	return ""
}

// planForStatus maps a subscription status to the plan it grants. on_hold keeps
// Pro during the dunning/retry grace window (Dodo re-attempts the renewal charge
// and flips back to active on success); only a terminal state drops to free.
func planForStatus(status string) string {
	switch status {
	case "active", "on_hold":
		return plan.Pro
	default: // cancelled, expired, failed, …
		return plan.Free
	}
}

// parseMS converts a Dodo ISO-8601 timestamp (next_billing_date) to unix ms.
// Returns 0 when empty or unparseable.
func parseMS(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}
