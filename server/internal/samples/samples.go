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
	verify.Vercel: {
		ContentType: "application/json",
		Headers: map[string]string{
			"x-vercel-deployment-url": "demo-ship-1a2b3c.vercel.app",
			"x-vercel-id":             "iad1::sample-0001",
		},
		Body: []byte(`{"id":"evt_vercel_sample0001","type":"deployment.succeeded","createdAt":1700000000,` +
			`"region":"iad1","payload":{"team":{"id":"team_sample"},"user":{"id":"user_sample"},` +
			`"deployment":{"id":"dpl_sample0001","name":"demo-ship","url":"demo-ship-1a2b3c.vercel.app",` +
			`"meta":{"githubCommitRef":"main","githubCommitSha":"a1b2c3d4"}},` +
			`"project":{"id":"prj_sample0001"},"target":"production"}}`),
	},
	// Twilio messaging webhook: form-encoded (Content-Type
	// application/x-www-form-urlencoded), the realistic shape of an inbound SMS.
	// The "+" in phone numbers is percent-encoded on the wire, exactly as Twilio
	// posts it; the signature is URL-bound and added at send time via Sign.
	verify.Twilio: {
		ContentType: "application/x-www-form-urlencoded",
		Headers:     map[string]string{"I-Twilio-Idempotency-Token": "sample-idem-0001"},
		Body: []byte(`MessageSid=SM0a1b2c3d4e5f60718293a4b5c6d7e8f90` +
			`&AccountSid=ACcafebabecafebabecafebabecafebabe` +
			`&MessagingServiceSid=MG9876543210fedcba9876543210fedcb0` +
			`&From=%2B14155550123&To=%2B18005551212&Body=your+hookd+code+is+2468` +
			`&NumMedia=0&NumSegments=1&SmsStatus=received&ApiVersion=2010-04-01`),
	},
}
