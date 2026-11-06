package dodo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// capture records what the fake Dodo server received so tests can assert the
// request was built correctly.
type capture struct {
	method, path, auth, accept, contentType string
	body                                     map[string]any
}

// newFake returns an httptest server that records the request into c and replies
// with status and respJSON.
func newFake(t *testing.T, c *capture, status int, respJSON string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c.method = r.Method
		c.path = r.URL.Path
		c.auth = r.Header.Get("Authorization")
		c.accept = r.Header.Get("Accept")
		c.contentType = r.Header.Get("Content-Type")
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&c.body)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(respJSON))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestCreateCustomer(t *testing.T) {
	var c capture
	srv := newFake(t, &c, 200, `{"customer_id":"cus_abc123"}`)
	id, err := NewLive("sk_test_key", srv.URL).CreateCustomer(context.Background(), "a@b.com", "Alice")
	if err != nil {
		t.Fatalf("CreateCustomer: %v", err)
	}
	if id != "cus_abc123" {
		t.Errorf("id = %q, want cus_abc123", id)
	}
	if c.method != http.MethodPost || c.path != "/customers" {
		t.Errorf("request = %s %s, want POST /customers", c.method, c.path)
	}
	if c.auth != "Bearer sk_test_key" {
		t.Errorf("auth = %q, want bearer key", c.auth)
	}
	if c.contentType != "application/json" {
		t.Errorf("content-type = %q", c.contentType)
	}
	if c.body["email"] != "a@b.com" || c.body["name"] != "Alice" {
		t.Errorf("body = %v, want email+name", c.body)
	}
}

func TestCreateCustomerOmitsEmptyName(t *testing.T) {
	var c capture
	srv := newFake(t, &c, 200, `{"customer_id":"cus_1"}`)
	if _, err := NewLive("k", srv.URL).CreateCustomer(context.Background(), "a@b.com", ""); err != nil {
		t.Fatal(err)
	}
	if _, present := c.body["name"]; present {
		t.Error("empty name must be omitted from the request body")
	}
}

func TestCreateCustomerEmptyIDIsError(t *testing.T) {
	var c capture
	srv := newFake(t, &c, 200, `{}`)
	if _, err := NewLive("k", srv.URL).CreateCustomer(context.Background(), "a@b.com", ""); err == nil {
		t.Fatal("a response with no customer_id must be an error")
	}
}

func TestCreateCheckoutSession(t *testing.T) {
	var c capture
	srv := newFake(t, &c, 200, `{"session_id":"sess_1","checkout_url":"https://pay.dodo/x"}`)
	url, err := NewLive("k", srv.URL).CreateCheckoutSession(context.Background(), CheckoutInput{
		CustomerID: "cus_1",
		ProductID:  "prod_pro_monthly",
		ReturnURL:  "https://app/return",
		Metadata:   map[string]string{"whook_user_id": "42"},
	})
	if err != nil {
		t.Fatalf("CreateCheckoutSession: %v", err)
	}
	if url != "https://pay.dodo/x" {
		t.Errorf("url = %q", url)
	}
	if c.path != "/checkouts" {
		t.Errorf("path = %q, want /checkouts", c.path)
	}
	cart, ok := c.body["product_cart"].([]any)
	if !ok || len(cart) != 1 {
		t.Fatalf("product_cart = %v, want one item", c.body["product_cart"])
	}
	item := cart[0].(map[string]any)
	if item["product_id"] != "prod_pro_monthly" {
		t.Errorf("product_id = %v", item["product_id"])
	}
	cust, _ := c.body["customer"].(map[string]any)
	if cust["customer_id"] != "cus_1" {
		t.Errorf("customer.customer_id = %v", cust["customer_id"])
	}
	if c.body["return_url"] != "https://app/return" {
		t.Errorf("return_url = %v", c.body["return_url"])
	}
	md, _ := c.body["metadata"].(map[string]any)
	if md["whook_user_id"] != "42" {
		t.Errorf("metadata not forwarded: %v", c.body["metadata"])
	}
}

func TestCreateCheckoutSessionMissingURLIsError(t *testing.T) {
	var c capture
	srv := newFake(t, &c, 200, `{"session_id":"sess_1"}`)
	if _, err := NewLive("k", srv.URL).CreateCheckoutSession(context.Background(), CheckoutInput{ProductID: "p", CustomerID: "c"}); err == nil {
		t.Fatal("a checkout response with no checkout_url must be an error")
	}
}

func TestCreatePortalSession(t *testing.T) {
	var c capture
	srv := newFake(t, &c, 200, `{"link":"https://portal.dodo/x"}`)
	url, err := NewLive("k", srv.URL).CreatePortalSession(context.Background(), "cus_9")
	if err != nil {
		t.Fatalf("CreatePortalSession: %v", err)
	}
	if url != "https://portal.dodo/x" {
		t.Errorf("url = %q", url)
	}
	if c.path != "/customers/cus_9/customer-portal/session" {
		t.Errorf("path = %q", c.path)
	}
}

func TestCreatePortalSessionMissingLinkIsError(t *testing.T) {
	var c capture
	srv := newFake(t, &c, 200, `{}`)
	if _, err := NewLive("k", srv.URL).CreatePortalSession(context.Background(), "cus_9"); err == nil {
		t.Fatal("a portal response with no link must be an error")
	}
}

func TestNon2xxIsError(t *testing.T) {
	var c capture
	srv := newFake(t, &c, 400, `{"error":"bad_request","message":"product not found"}`)
	_, err := NewLive("k", srv.URL).CreateCustomer(context.Background(), "a@b.com", "")
	if err == nil {
		t.Fatal("a non-2xx response must be an error")
	}
	// The status code should surface for debugging (body text is clipped, not logged).
	if got := err.Error(); got == "" || !containsStatus(got, "400") {
		t.Errorf("error %q should mention status 400", got)
	}
}

func containsStatus(s, code string) bool {
	for i := 0; i+len(code) <= len(s); i++ {
		if s[i:i+len(code)] == code {
			return true
		}
	}
	return false
}

func TestClipTruncates(t *testing.T) {
	long := make([]byte, 500)
	for i := range long {
		long[i] = 'a'
	}
	got := clip(long)
	if len([]rune(got)) > 201 { // 200 chars + the ellipsis rune
		t.Errorf("clip did not truncate: len=%d", len([]rune(got)))
	}
	if clip([]byte("  short  ")) != "short" {
		t.Errorf("clip should trim whitespace of short input")
	}
}
