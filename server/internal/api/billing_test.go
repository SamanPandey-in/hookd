package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"whook/internal/dodo"
	"whook/internal/httpx"
	"whook/internal/store"
	"whook/internal/verify"
)

// testWebhookSecret is a valid Standard-Webhooks symmetric secret (whsec_ + base64).
var testWebhookSecret = "whsec_" + base64.StdEncoding.EncodeToString([]byte("dodo-webhook-signing-key-0123456789"))

// fakeDodo is a stand-in for the Dodo API so checkout/portal are testable offline.
type fakeDodo struct {
	customerID        string
	checkoutURL       string
	portalURL         string
	createCustomerErr error
	lastCheckout      dodo.CheckoutInput
	customerCreated   bool
}

func (f *fakeDodo) CreateCustomer(_ context.Context, _, _ string) (string, error) {
	if f.createCustomerErr != nil {
		return "", f.createCustomerErr
	}
	f.customerCreated = true
	return f.customerID, nil
}
func (f *fakeDodo) CreateCheckoutSession(_ context.Context, in dodo.CheckoutInput) (string, error) {
	f.lastCheckout = in
	return f.checkoutURL, nil
}
func (f *fakeDodo) CreatePortalSession(_ context.Context, _ string) (string, error) {
	return f.portalURL, nil
}

// signedDodoReq builds a POST /webhooks/dodo request whose body is signed with
// our own Standard-Webhooks signer (exactly as Dodo signs its webhooks).
func signedDodoReq(t *testing.T, body []byte) *http.Request {
	t.Helper()
	sr := verify.Sign(verify.SignInput{Provider: verify.StandardWebhooks, Secret: testWebhookSecret, Body: body})
	if sr.Err != nil {
		t.Fatalf("sign webhook: %v", sr.Err)
	}
	req := httptest.NewRequest(http.MethodPost, "/webhooks/dodo", bytes.NewReader(body))
	for k, v := range sr.Headers {
		req.Header.Set(k, v)
	}
	return req
}

func newBilling(st *store.Fake, d dodo.Client) *Billing {
	return &Billing{
		Store:          st,
		Dodo:           d,
		MaxJSONBody:    1 << 20,
		WebhookSecret:  testWebhookSecret,
		ProductMonthly: "prod_monthly",
		ProductAnnual:  "prod_annual",
		SuccessURL:     "https://app.example.com/ok",
		CancelURL:      "https://app.example.com/cancel",
	}
}

func TestDodoWebhookActivatesPro(t *testing.T) {
	st := store.NewFake()
	u, _ := st.UpsertUserByGitHub(context.Background(), 55, "priya", "p@x.com")
	_ = st.SetUserDodoCustomer(context.Background(), u.ID, "cus_42")
	b := newBilling(st, nil)

	body := []byte(`{"type":"subscription.active","data":{"payload_type":"Subscription","subscription_id":"sub_1","status":"active","next_billing_date":"2026-12-03T00:00:00Z","cancel_at_next_billing_date":false,"customer":{"customer_id":"cus_42"}}}`)
	rec := httptest.NewRecorder()
	b.Webhook(rec, signedDodoReq(t, body))
	if rec.Code != http.StatusOK {
		t.Fatalf("valid webhook: %d %s", rec.Code, rec.Body.String())
	}

	got, _ := st.GetUser(context.Background(), u.ID)
	if got.Plan != "pro" {
		t.Fatalf("user should be pro, got %q", got.Plan)
	}
	if got.Subscription.Status != "active" || got.Subscription.ID != "sub_1" {
		t.Fatalf("subscription not set: %+v", got.Subscription)
	}
	if got.Subscription.CurrentPeriodEnd == 0 {
		t.Fatalf("current_period_end not parsed from next_billing_date")
	}
}

func TestDodoWebhookTamperedSignatureRejected(t *testing.T) {
	st := store.NewFake()
	u, _ := st.UpsertUserByGitHub(context.Background(), 55, "priya", "p@x.com")
	_ = st.SetUserDodoCustomer(context.Background(), u.ID, "cus_42")
	b := newBilling(st, nil)

	body := []byte(`{"type":"subscription.active","data":{"subscription_id":"sub_1","status":"active","customer":{"customer_id":"cus_42"}}}`)
	// Sign the original body, but send a tampered body with the same headers.
	sr := verify.Sign(verify.SignInput{Provider: verify.StandardWebhooks, Secret: testWebhookSecret, Body: body})
	tampered := append(append([]byte{}, body...), '!')
	req := httptest.NewRequest(http.MethodPost, "/webhooks/dodo", bytes.NewReader(tampered))
	for k, v := range sr.Headers {
		req.Header.Set(k, v)
	}

	rec := httptest.NewRecorder()
	b.Webhook(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("tampered webhook must be 400, got %d %s", rec.Code, rec.Body.String())
	}
	got, _ := st.GetUser(context.Background(), u.ID)
	if got.Plan == "pro" {
		t.Fatal("tampered webhook must not upgrade the user")
	}
}

func TestDodoWebhookIdempotent(t *testing.T) {
	st := store.NewFake()
	u, _ := st.UpsertUserByGitHub(context.Background(), 55, "priya", "p@x.com")
	_ = st.SetUserDodoCustomer(context.Background(), u.ID, "cus_42")
	b := newBilling(st, nil)

	body := []byte(`{"type":"subscription.active","data":{"subscription_id":"sub_1","status":"active","customer":{"customer_id":"cus_42"}}}`)
	// Sign once; both deliveries carry the identical webhook-id header.
	sr := verify.Sign(verify.SignInput{Provider: verify.StandardWebhooks, Secret: testWebhookSecret, Body: body})
	if sr.Err != nil {
		t.Fatalf("sign: %v", sr.Err)
	}
	deliver := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/webhooks/dodo", bytes.NewReader(body))
		for k, v := range sr.Headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		b.Webhook(rec, req)
		return rec
	}

	if rec := deliver(); rec.Code != http.StatusOK {
		t.Fatalf("first delivery: %d %s", rec.Code, rec.Body.String())
	}

	// Manually downgrade, then replay the SAME signed webhook (same webhook-id).
	// A correct idempotency guard must NOT re-apply the upgrade.
	_ = st.UpdateUserSubscription(context.Background(), u.ID, "free", store.Subscription{})
	rec3 := deliver()
	if rec3.Code != http.StatusOK {
		t.Fatalf("duplicate delivery should ack 200, got %d %s", rec3.Code, rec3.Body.String())
	}
	var resp map[string]string
	_ = json.Unmarshal(rec3.Body.Bytes(), &resp)
	if resp["status"] != "duplicate" {
		t.Fatalf("duplicate should report status=duplicate, got %v", resp)
	}
	got, _ := st.GetUser(context.Background(), u.ID)
	if got.Plan == "pro" {
		t.Fatal("duplicate webhook re-applied the upgrade (not idempotent)")
	}
}

func TestDodoWebhookCancelDowngrades(t *testing.T) {
	st := store.NewFake()
	u, _ := st.UpsertUserByGitHub(context.Background(), 55, "priya", "p@x.com")
	_ = st.SetUserDodoCustomer(context.Background(), u.ID, "cus_42")
	_ = st.UpdateUserSubscription(context.Background(), u.ID, "pro", store.Subscription{Status: "active", ID: "sub_1"})
	b := newBilling(st, nil)

	body := []byte(`{"type":"subscription.expired","data":{"subscription_id":"sub_1","status":"expired","customer":{"customer_id":"cus_42"}}}`)
	rec := httptest.NewRecorder()
	b.Webhook(rec, signedDodoReq(t, body))
	if rec.Code != http.StatusOK {
		t.Fatalf("expire webhook: %d %s", rec.Code, rec.Body.String())
	}
	got, _ := st.GetUser(context.Background(), u.ID)
	if got.Plan != "free" {
		t.Fatalf("expired subscription should drop to free, got %q", got.Plan)
	}
}

func TestDodoWebhookNotConfigured(t *testing.T) {
	st := store.NewFake()
	b := newBilling(st, nil)
	b.WebhookSecret = "" // not configured
	rec := httptest.NewRecorder()
	b.Webhook(rec, httptest.NewRequest(http.MethodPost, "/webhooks/dodo", bytes.NewReader([]byte("{}"))))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("unconfigured webhook must be 503, got %d", rec.Code)
	}
}

func TestCheckoutCreatesCustomerAndSession(t *testing.T) {
	st := store.NewFake()
	u, _ := st.UpsertUserByGitHub(context.Background(), 55, "priya", "p@x.com")
	fd := &fakeDodo{customerID: "cus_new", checkoutURL: "https://checkout.dodo/abc"}
	b := newBilling(st, fd)

	req := jsonReq(http.MethodPost, "/api/billing/checkout", map[string]string{"plan": "pro", "interval": "monthly"})
	req = req.WithContext(httpx.WithUserID(req.Context(), u.ID))
	rec := httptest.NewRecorder()
	b.Checkout(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("checkout: %d %s", rec.Code, rec.Body.String())
	}
	var resp map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["checkout_url"] != "https://checkout.dodo/abc" {
		t.Fatalf("expected checkout_url, got %v", resp)
	}
	if !fd.customerCreated || fd.lastCheckout.ProductID != "prod_monthly" {
		t.Fatalf("expected monthly product + customer created, got %+v", fd.lastCheckout)
	}
	if fd.lastCheckout.Metadata["whook_user_id"] == "" {
		t.Fatal("checkout must stamp whook_user_id in metadata")
	}
	got, _ := st.GetUser(context.Background(), u.ID)
	if got.DodoCustomerID != "cus_new" {
		t.Fatalf("customer id not persisted, got %q", got.DodoCustomerID)
	}
}

func TestCheckoutNotConfigured(t *testing.T) {
	st := store.NewFake()
	u, _ := st.UpsertUserByGitHub(context.Background(), 55, "priya", "p@x.com")
	b := newBilling(st, nil) // Dodo nil
	req := jsonReq(http.MethodPost, "/api/billing/checkout", map[string]string{"plan": "pro"})
	req = req.WithContext(httpx.WithUserID(req.Context(), u.ID))
	rec := httptest.NewRecorder()
	b.Checkout(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("checkout with no Dodo must be 503, got %d", rec.Code)
	}
}

func TestPortalRequiresSubscription(t *testing.T) {
	st := store.NewFake()
	u, _ := st.UpsertUserByGitHub(context.Background(), 55, "priya", "p@x.com")
	fd := &fakeDodo{portalURL: "https://portal.dodo/xyz"}
	b := newBilling(st, fd)

	// No Dodo customer yet -> 409 no subscription.
	req := jsonReq(http.MethodGet, "/api/billing/portal", nil)
	req = req.WithContext(httpx.WithUserID(req.Context(), u.ID))
	rec := httptest.NewRecorder()
	b.Portal(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("portal without subscription must be 409, got %d %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("no subscription")) {
		t.Fatalf("409 should say no subscription, got %s", rec.Body.String())
	}

	// With a Dodo customer -> 200 with portal_url.
	_ = st.SetUserDodoCustomer(context.Background(), u.ID, "cus_42")
	req2 := jsonReq(http.MethodGet, "/api/billing/portal", nil)
	req2 = req2.WithContext(httpx.WithUserID(req2.Context(), u.ID))
	rec2 := httptest.NewRecorder()
	b.Portal(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("portal: %d %s", rec2.Code, rec2.Body.String())
	}
	if !bytes.Contains(rec2.Body.Bytes(), []byte("https://portal.dodo/xyz")) {
		t.Fatalf("expected portal_url, got %s", rec2.Body.String())
	}
}
