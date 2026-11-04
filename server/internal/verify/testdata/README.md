# verify/testdata — signature fixtures & provenance

These are the exact payloads and signatures the `verify` tests assert against.

The tests themselves are **hermetic**: per this package's dependency rule (standard
library only — no `os`, no `embed`), the test files carry these same bytes as inline
constants rather than reading them from disk. These files mirror those constants so a
human can see the provenance and re-derive each signature by hand.

| Fixture | Provider | Provenance | Source |
|---|---|---|---|
| `github_official_vector.txt` | GitHub | **Official published vector** — reproduced exactly (recomputed in a scratch program 2026-11-03). | https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries |
| `standard_webhooks_official_vector.json` | Standard Webhooks (Svix/Dodo) | **Official/published vector** — Svix libraries' canonical test vector; construction matches the Standard Webhooks spec. Recomputed independently 2026-11-03. | https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md |
| `stripe_sample_event.json` | Stripe | **Self-generated.** Stripe publishes no reproducible vector (no secret given), so fixtures are signed with a known test secret and the expected hex HMAC-SHA256 is recomputed independently in-test. | scheme per https://docs.stripe.com/webhooks/signature |
| `slack_sample_body.txt` | Slack | **Self-generated.** Slack's published worked example truncates the body, so it is not reproducible; construction `v0:timestamp:body` is confirmed from the docs and signatures are recomputed in-test. | https://docs.slack.dev/authentication/verifying-requests-from-slack |

Razorpay (`X-Razorpay-Signature`, hex HMAC-SHA256 over raw body) and Shopify
(`X-Shopify-Hmac-Sha256`, **base64** HMAC-SHA256 over raw body) have no public
reproducible vector either; their fixtures are self-generated the same way.

## Official vectors (verbatim)

### GitHub
```
secret:  It's a Secret to Everybody
body:    Hello, World!
header:  X-Hub-Signature-256: sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17
```

### Standard Webhooks (Svix)
```
secret:            whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw
webhook-id:        msg_p5jXN8AQM9LWM0D4loKWxJek
webhook-timestamp: 1614265330
payload:           {"test": 2432232314}
signed content:    msg_p5jXN8AQM9LWM0D4loKWxJek.1614265330.{"test": 2432232314}
header:            webhook-signature: v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=
```
(Secret: strip `whsec_`, base64-decode the remainder → 24-byte HMAC key.)
