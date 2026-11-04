// Package dodo is a thin client for the Dodo Payments REST API: creating a
// customer, a hosted checkout session, and a customer-portal session.
//
// The Client interface is the seam the billing handlers code against, so they
// are unit-testable with a fake (no live Dodo key needed). Live is the real
// net/http implementation.
//
// Docs relied on (confirmed live 2026-11-03):
//   - Checkout session:  https://docs.dodopayments.com/developer-resources/checkout-session
//     POST {base}/checkouts  →  {"session_id":"…","checkout_url":"…"}
//   - Customer portal:   https://docs.dodopayments.com/api-reference/customers/create-customer-portal-session
//     POST {base}/customers/{customer_id}/customer-portal/session  →  {"link":"…"}
//   - Customers:         https://docs.dodopayments.com/api-reference/customers/post-customers
//     POST {base}/customers  →  {"customer_id":"…", …}
//   - Auth: HTTP bearer — Authorization: Bearer <DODO_API_KEY>.
//   - Base URL: https://test.dodopayments.com (test) | https://live.dodopayments.com (live).
package dodo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// CheckoutInput is what the billing layer needs to open a hosted checkout.
type CheckoutInput struct {
	CustomerID string            // existing Dodo customer to bill
	ProductID  string            // subscription product (monthly or annual price)
	ReturnURL  string            // where Dodo returns the buyer after payment
	Metadata   map[string]string // stored with the session (we stamp whook_user_id)
}

// Client is the subset of the Dodo API the billing handlers use.
type Client interface {
	// CreateCustomer creates a Dodo customer and returns its id.
	CreateCustomer(ctx context.Context, email, name string) (customerID string, err error)
	// CreateCheckoutSession opens a hosted checkout and returns the redirect URL.
	CreateCheckoutSession(ctx context.Context, in CheckoutInput) (checkoutURL string, err error)
	// CreatePortalSession returns a customer-portal link for a Dodo customer.
	CreatePortalSession(ctx context.Context, customerID string) (portalURL string, err error)
}

// Live is the real Dodo API client.
type Live struct {
	apiKey  string
	baseURL string
	hc      *http.Client
}

// NewLive builds a live client. baseURL has no trailing slash.
func NewLive(apiKey, baseURL string) *Live {
	return &Live{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(baseURL, "/"),
		hc:      &http.Client{Timeout: 15 * time.Second},
	}
}

func (l *Live) CreateCustomer(ctx context.Context, email, name string) (string, error) {
	body := map[string]any{"email": email}
	if name != "" {
		body["name"] = name
	}
	var out struct {
		CustomerID string `json:"customer_id"`
	}
	if err := l.do(ctx, http.MethodPost, "/customers", body, &out); err != nil {
		return "", err
	}
	if out.CustomerID == "" {
		return "", fmt.Errorf("dodo: create customer: empty customer_id in response")
	}
	return out.CustomerID, nil
}

func (l *Live) CreateCheckoutSession(ctx context.Context, in CheckoutInput) (string, error) {
	body := map[string]any{
		"product_cart": []map[string]any{{"product_id": in.ProductID, "quantity": 1}},
		"customer":     map[string]any{"customer_id": in.CustomerID},
	}
	if in.ReturnURL != "" {
		body["return_url"] = in.ReturnURL
	}
	if len(in.Metadata) > 0 {
		body["metadata"] = in.Metadata
	}
	var out struct {
		SessionID   string `json:"session_id"`
		CheckoutURL string `json:"checkout_url"`
	}
	if err := l.do(ctx, http.MethodPost, "/checkouts", body, &out); err != nil {
		return "", err
	}
	if out.CheckoutURL == "" {
		return "", fmt.Errorf("dodo: checkout session has no checkout_url (session_id=%s)", out.SessionID)
	}
	return out.CheckoutURL, nil
}

func (l *Live) CreatePortalSession(ctx context.Context, customerID string) (string, error) {
	var out struct {
		Link string `json:"link"`
	}
	path := "/customers/" + customerID + "/customer-portal/session"
	if err := l.do(ctx, http.MethodPost, path, nil, &out); err != nil {
		return "", err
	}
	if out.Link == "" {
		return "", fmt.Errorf("dodo: portal session response has no link")
	}
	return out.Link, nil
}

// do performs an authenticated JSON request and decodes a JSON response.
func (l *Live) do(ctx context.Context, method, path string, reqBody any, out any) error {
	var rdr io.Reader
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return fmt.Errorf("dodo: marshal request: %w", err)
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, l.baseURL+path, rdr)
	if err != nil {
		return fmt.Errorf("dodo: new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+l.apiKey)
	req.Header.Set("Accept", "application/json")
	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := l.hc.Do(req)
	if err != nil {
		return fmt.Errorf("dodo: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// The error body may echo request detail; keep it short and never log it
		// at the caller — surface a status-scoped message.
		return fmt.Errorf("dodo: %s %s returned %d: %s", method, path, resp.StatusCode, clip(respBody))
	}
	if out != nil {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("dodo: decode %s %s response: %w", method, path, err)
		}
	}
	return nil
}

func clip(b []byte) string {
	const n = 200
	s := strings.TrimSpace(string(b))
	if len(s) > n {
		return s[:n] + "…"
	}
	return s
}
