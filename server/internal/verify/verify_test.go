package verify

import (
	"net/http"
	"testing"
	"time"
)

func TestDetect(t *testing.T) {
	cases := []struct {
		name string
		h    http.Header
		want Provider
		ok   bool
	}{
		{"stripe", hdr("Stripe-Signature", "t=1,v1=abc"), Stripe, true},
		{"github_256", hdr("X-Hub-Signature-256", "sha256=abc"), GitHub, true},
		{"github_legacy", hdr("X-Hub-Signature", "sha1=abc"), GitHub, true},
		{"razorpay", hdr("X-Razorpay-Signature", "abc"), Razorpay, true},
		{"shopify", hdr("X-Shopify-Hmac-Sha256", "abc"), Shopify, true},
		{"slack", hdr("X-Slack-Signature", "v0=abc"), Slack, true},
		{"vercel", hdr("x-vercel-signature", "abc"), Vercel, true},
		{"lemon_squeezy", hdr("X-Signature", "abc"), LemonSqueezy, true},
		{"twitch", hdr("Twitch-Eventsub-Message-Signature", "sha256=abc"), Twitch, true},
		{"standard_webhooks", hdr("webhook-id", "msg_1", "webhook-timestamp", "1", "webhook-signature", "v1,abc"), StandardWebhooks, true},
		{"sw_incomplete_is_not_detected", hdr("webhook-signature", "v1,abc"), "", false},
		{"none", hdr("Content-Type", "application/json"), "", false},
		{"empty", hdr(), "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := Detect(tc.h)
			if got != tc.want || ok != tc.ok {
				t.Fatalf("Detect = (%q, %v); want (%q, %v)", got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestDetect_NilHeader(t *testing.T) {
	if p, ok := Detect(nil); ok || p != "" {
		t.Fatalf("Detect(nil) = (%q,%v); want (\"\",false)", p, ok)
	}
}

// roundTripSecret is a per-provider signing secret valid for that scheme.
var roundTripSecret = map[Provider]string{
	Stripe:           "whsec_stripe_roundtrip_secret_value",
	GitHub:           "github_roundtrip_secret",
	Razorpay:         "razorpay_roundtrip_secret",
	Shopify:          "shopify_roundtrip_secret",
	StandardWebhooks: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
	Slack:            "slack_roundtrip_secret",
	Vercel:           "vercel_roundtrip_secret",
	LemonSqueezy:     "lemon_squeezy_roundtrip_secret",
	Twitch:           "twitch_roundtrip_secret",
}

// Sign(body) then Verify(body) must Pass for every provider; tampering the body
// must not Pass. This is the core correctness invariant for re-signed replay.
func TestRoundTrip_AllProviders(t *testing.T) {
	now := fixedNow
	body := []byte(`{"id":"evt_roundtrip","amount":4200,"currency":"usd"}`)

	for _, p := range []Provider{Stripe, GitHub, Razorpay, Shopify, StandardWebhooks, Slack, Vercel, LemonSqueezy, Twitch} {
		t.Run(string(p), func(t *testing.T) {
			secret := roundTripSecret[p]
			sr := Sign(SignInput{Provider: p, Secret: secret, Body: body, Now: now})
			if sr.Err != nil {
				t.Fatalf("Sign(%s) error: %v", p, sr.Err)
			}
			if len(sr.Headers) == 0 {
				t.Fatalf("Sign(%s) produced no headers", p)
			}
			h := http.Header{}
			for k, v := range sr.Headers {
				h.Set(k, v)
			}
			// Signed headers must verify.
			assertResult(t, Verify(Input{Provider: p, Secret: secret, Body: body, Headers: h, Now: now}), Pass, CauseOK)

			// Tampered body must NOT pass.
			tampered := append(append([]byte{}, body...), '!')
			got := Verify(Input{Provider: p, Secret: secret, Body: tampered, Headers: h, Now: now})
			if got.Status == Pass {
				t.Fatalf("Verify(%s) with tampered body returned Pass — false verified is a product-destroying bug", p)
			}
		})
	}
}

func TestSign_MissingSecret(t *testing.T) {
	for _, p := range []Provider{Stripe, GitHub, Razorpay, Shopify, StandardWebhooks, Slack, Vercel, LemonSqueezy, Twitch} {
		sr := Sign(SignInput{Provider: p, Secret: "", Body: []byte("{}"), Now: fixedNow})
		if sr.Err == nil {
			t.Errorf("Sign(%s) with empty secret: expected error, got headers %v", p, sr.Headers)
		}
	}
}

func TestVerify_UnsupportedProvider(t *testing.T) {
	got := Verify(Input{Provider: Provider("mailgun"), Secret: "x", Body: []byte("{}"), Headers: hdr()})
	assertResult(t, got, Unknown, CauseUnsupported)
}

func TestSign_UnsupportedProvider(t *testing.T) {
	sr := Sign(SignInput{Provider: Provider("mailgun"), Secret: "x", Body: []byte("{}")})
	if sr.Err == nil {
		t.Fatal("Sign(unsupported) expected error")
	}
}

// Every v1 provider must be registered as both a Verifier and a Signer.
func TestRegistration(t *testing.T) {
	for _, p := range []Provider{Stripe, GitHub, Razorpay, Shopify, StandardWebhooks, Slack, Vercel, LemonSqueezy, Twitch} {
		if _, ok := Default.Get(p); !ok {
			t.Errorf("no verifier registered for %s", p)
		}
		if _, ok := DefaultSigners[p]; !ok {
			t.Errorf("no signer registered for %s", p)
		}
	}
}

// Re-signing with a fresh timestamp defeats replay protection on the stale
// original, which is the point of the re-sign toggle.
func TestResign_RefreshesTimestamp(t *testing.T) {
	body := []byte(`{"id":"evt_stale"}`)
	stale := fixedNow.Add(-2 * time.Hour)
	// Original signed long ago → out of tolerance now.
	orig := Sign(SignInput{Provider: Stripe, Secret: roundTripSecret[Stripe], Body: body, Now: stale})
	h := http.Header{}
	for k, v := range orig.Headers {
		h.Set(k, v)
	}
	staleRes := Verify(Input{Provider: Stripe, Secret: roundTripSecret[Stripe], Body: body, Headers: h, Now: fixedNow})
	if staleRes.Cause != CauseTimestampSkew {
		t.Fatalf("expected stale original to fail on timestamp skew, got %q (%s)", staleRes.Cause, staleRes.Summary)
	}
	// Re-sign with a fresh timestamp → passes.
	fresh := Sign(SignInput{Provider: Stripe, Secret: roundTripSecret[Stripe], Body: body, Now: fixedNow})
	h2 := http.Header{}
	for k, v := range fresh.Headers {
		h2.Set(k, v)
	}
	assertResult(t, Verify(Input{Provider: Stripe, Secret: roundTripSecret[Stripe], Body: body, Headers: h2, Now: fixedNow}), Pass, CauseOK)
}
