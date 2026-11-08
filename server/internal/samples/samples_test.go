package samples

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	neturl "net/url"
	"strings"
	"testing"
	"time"

	"whook/internal/verify"
)

// Every registered sample must be well-formed: a content type, a non-empty body
// that is valid JSON, and a lookup that round-trips through For.
func TestSamplesAreWellFormed(t *testing.T) {
	provs := Providers()
	if len(provs) == 0 {
		t.Fatal("Providers() returned none")
	}
	for _, p := range provs {
		s, ok := For(p)
		if !ok {
			t.Errorf("For(%s) = !ok, but it is listed by Providers()", p)
			continue
		}
		if s.ContentType == "" {
			t.Errorf("%s: empty ContentType", p)
		}
		if len(s.Body) == 0 {
			t.Errorf("%s: empty Body", p)
		}
		// A sample body must be well-formed for its content type: JSON bodies must
		// parse as JSON; form-encoded bodies (Twilio) must parse as a query with at
		// least one key.
		if strings.Contains(s.ContentType, "x-www-form-urlencoded") {
			vals, err := neturl.ParseQuery(string(s.Body))
			if err != nil || len(vals) == 0 {
				t.Errorf("%s: Body is not valid form-encoding: %v", p, err)
			}
		} else {
			var js any
			if err := json.Unmarshal(s.Body, &js); err != nil {
				t.Errorf("%s: Body is not valid JSON: %v", p, err)
			}
		}
	}
}

func TestForUnknownProvider(t *testing.T) {
	if _, ok := For(verify.Provider("not-a-provider")); ok {
		t.Error("For(unknown) should report ok=false")
	}
}

// Every provider the verify engine supports should ship a sample, so the "send a
// sample event" button works for all of them. (Guards against adding a verifier
// but forgetting its sample.)
func TestEveryVerifiedProviderHasASample(t *testing.T) {
	for _, p := range verify.Default.Providers() {
		if _, ok := For(p); !ok {
			t.Errorf("verify supports %s but samples has no template for it", p)
		}
	}
}

// The headline contract (see the package doc): a sample signed with a secret and
// sent to an endpoint configured for that provider verifies as PASS. This is what
// makes "send a sample" a convincing demo, so it must hold for every provider.
func TestSignedSamplesVerifyAsPass(t *testing.T) {
	// Standard Webhooks (Svix/Dodo) requires the secret to be "whsec_" + base64;
	// the other providers treat the secret as an opaque HMAC key, so a single
	// whsec_-prefixed base64 secret round-trips for all of them.
	secret := "whsec_" + base64.StdEncoding.EncodeToString([]byte("sample-signing-secret-key-000001"))
	now := time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)
	// A representative ingest URL for the URL-bound scheme (Twilio); the other
	// providers ignore it, so passing it everywhere is harmless.
	const sampleURL = "https://api.hookd.dev/i/ep_sample"

	for _, p := range Providers() {
		t.Run(string(p), func(t *testing.T) {
			s, _ := For(p)

			signed := verify.Sign(verify.SignInput{
				Provider: p, Secret: secret, Body: s.Body, Now: now, URL: sampleURL,
			})
			if signed.Err != nil {
				t.Fatalf("Sign(%s): %v", p, signed.Err)
			}

			h := http.Header{}
			h.Set("Content-Type", s.ContentType)
			for k, v := range s.Headers {
				h.Set(k, v)
			}
			for k, v := range signed.Headers {
				h.Set(k, v)
			}
			// A URL-bound signer may rewrite the URL (Twilio JSON mode); use the
			// returned one when present so sign and verify agree.
			verifyURL := sampleURL
			if signed.URL != "" {
				verifyURL = signed.URL
			}

			res := verify.Verify(verify.Input{
				Provider: p, Secret: secret, Headers: h, Body: s.Body, Now: now, URL: verifyURL,
			})
			if res.Status != verify.Pass {
				t.Fatalf("%s sample did not verify as PASS: status=%s cause=%s summary=%q",
					p, res.Status, res.Cause, res.Summary)
			}
		})
	}
}
