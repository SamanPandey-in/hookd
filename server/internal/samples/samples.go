// Package samples holds per-provider sample webhook payloads so a user can fire
// a realistic event at an endpoint before the real integration exists. Bodies
// are inert JSON; signature headers are added at send time by the caller using
// the verify engine's Sign, so a sample sent to an endpoint with a secret
// verifies as PASS (great for the demo).
package samples

import "whook/internal/verify"

// Sample is a provider template: a content type, raw body bytes, and any
// non-signature headers the provider characteristically sends (so auto-detect
// and the inspector look real).
type Sample struct {
	ContentType string
	Body        []byte
	Headers     map[string]string
}

// For returns the sample template for a provider.
func For(p verify.Provider) (Sample, bool) {
	s, ok := table[p]
	return s, ok
}

// Providers lists providers that have a sample.
func Providers() []verify.Provider {
	out := make([]verify.Provider, 0, len(table))
	for p := range table {
		out = append(out, p)
	}
	return out
}

var table = map[verify.Provider]Sample{
	verify.Stripe: {
		ContentType: "application/json",
		Headers:     map[string]string{"Stripe-Version": "2024-06-20"},
		Body: []byte(`{"id":"evt_1PZsample","object":"event","type":"checkout.session.completed",` +
			`"api_version":"2024-06-20","created":1700000000,"livemode":false,` +
			`"data":{"object":{"id":"cs_test_sample","object":"checkout.session","amount_total":2000,` +
			`"currency":"usd","customer":"cus_sample","payment_status":"paid","status":"complete"}}}`),
	},
	verify.GitHub: {
		ContentType: "application/json",
		Headers:     map[string]string{"X-GitHub-Event": "push", "X-GitHub-Delivery": "sample-delivery-0001"},
		Body: []byte(`{"ref":"refs/heads/main","before":"0000000000000000000000000000000000000000",` +
			`"after":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2","repository":{"id":1,"name":"demo",` +
			`"full_name":"octocat/demo","private":false},"pusher":{"name":"octocat","email":"octo@example.com"},` +
			`"commits":[{"id":"a1b2c3d","message":"Ship webhook debugger","author":{"name":"octocat"}}]}`),
	},
	verify.Razorpay: {
		ContentType: "application/json",
		Headers:     map[string]string{"X-Razorpay-Event-Id": "evt_sample0001"},
		Body: []byte(`{"entity":"event","account_id":"acc_sample","event":"payment.captured",` +
			`"contains":["payment"],"payload":{"payment":{"entity":{"id":"pay_sample0001","entity":"payment",` +
			`"amount":50000,"currency":"INR","status":"captured","order_id":"order_sample","method":"card"}}},` +
			`"created_at":1700000000}`),
	},
	verify.Shopify: {
		ContentType: "application/json",
		Headers: map[string]string{
			"X-Shopify-Topic":       "orders/create",
			"X-Shopify-Shop-Domain": "sample-shop.myshopify.com",
			"X-Shopify-API-Version": "2024-07",
			"X-Shopify-Webhook-Id":  "sample-webhook-0001",
		},
		Body: []byte(`{"id":820982911946154500,"email":"jon@example.com","currency":"USD",` +
			`"total_price":"199.00","financial_status":"paid","name":"#1001",` +
			`"line_items":[{"id":1,"title":"Pro Plan","quantity":1,"price":"199.00"}]}`),
	},
	verify.StandardWebhooks: {
		ContentType: "application/json",
		Headers:     map[string]string{},
		Body: []byte(`{"type":"subscription.active","timestamp":"2024-01-01T00:00:00Z",` +
			`"data":{"subscription_id":"sub_sample0001","customer":{"email":"dev@example.com"},` +
			`"product_id":"prod_pro","status":"active","recurring_pre_tax_amount":1200,"currency":"USD"}}`),
	},
	verify.Slack: {
		ContentType: "application/json",
		Headers:     map[string]string{},
		Body: []byte(`{"token":"sampletoken","team_id":"T0001","api_app_id":"A0001",` +
			`"event":{"type":"app_mention","user":"U0001","text":"<@U0BOT> ship it","ts":"1700000000.000100",` +
			`"channel":"C0001"},"type":"event_callback","event_id":"Ev0001","event_time":1700000000}`),
	},
}
