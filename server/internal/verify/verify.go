// Package verify is the signature-verification engine — the product's core
// differentiator. It verifies incoming webhook signatures for multiple providers
// and, crucially, explains WHY verification passed or failed in precise terms.
//
// CONTRACT (do not break — the rest of the backend depends on this surface):
//   - Verifiers operate on the EXACT raw request body bytes as received. Never
//     re-serialize or re-encode the body before verifying; signatures are computed
//     over raw bytes and any mutation (e.g. a JSON parser re-emitting the body) is
//     itself the #1 real-world cause of failure we must detect, not cause.
//   - Comparisons MUST be constant-time (crypto/subtle.ConstantTimeCompare).
//   - Verifiers MUST NOT do network or disk I/O and MUST be deterministic given
//     Input.Now (so timestamp-tolerance logic is testable).
//   - A verifier must NEVER report Pass unless the signature genuinely validates.
//     A false "verified" is a product-destroying bug.
//
// This file (types + Registry + Verify + Detect signatures) is the stable contract.
// The verify engine agent fills in Detect's body, the per-provider Verifier
// implementations (one file each), and the table-driven tests + fixtures.
package verify

import (
	"net/http"
	"time"
)

// Provider identifies a webhook source whose signature scheme we understand.
type Provider string

const (
	Stripe           Provider = "stripe"            // Stripe-Signature: t=,v1= HMAC-SHA256 over "t.payload", hex
	GitHub           Provider = "github"            // X-Hub-Signature-256: "sha256=" HMAC-SHA256, hex
	Razorpay         Provider = "razorpay"          // X-Razorpay-Signature: HMAC-SHA256, hex
	Shopify          Provider = "shopify"           // X-Shopify-Hmac-Sha256: HMAC-SHA256, base64
	StandardWebhooks Provider = "standard_webhooks" // Svix/Dodo: webhook-id,-timestamp,-signature "v1,<b64>" over "id.ts.payload"
	Slack            Provider = "slack"             // X-Slack-Signature: "v0=" HMAC-SHA256 over "v0:ts:body", hex; X-Slack-Request-Timestamp
)

// Status is the top-level verification outcome.
type Status string

const (
	Pass    Status = "pass"    // signature genuinely validated
	Fail    Status = "fail"    // signature present but did not validate
	Unknown Status = "unknown" // no signature header / provider undetermined / unsupported
)

// Cause is a machine-readable reason, so the UI can explain precisely WHY.
// The one-line human Summary is derived from these in each verifier.
type Cause string

const (
	CauseOK                Cause = "ok"
	CauseNoSignatureHeader Cause = "no_signature_header"
	CauseMalformedHeader   Cause = "malformed_signature_header"
	CauseMissingSecret     Cause = "missing_secret"
	CauseSignatureMismatch Cause = "signature_mismatch"
	CauseTimestampSkew     Cause = "timestamp_out_of_tolerance"
	CauseEncodingMismatch  Cause = "encoding_mismatch"     // e.g. header is base64 but secret produced a hex-length digest
	CauseBodyAltered       Cause = "body_possibly_altered" // heuristic: whitespace/re-serialization differs from a canonical parse
	CauseUnsupported       Cause = "unsupported_provider"
)

// Input is everything a verifier needs. Body MUST be the exact raw bytes received.
type Input struct {
	Provider         Provider
	Secret           string      // signing secret the user configured (already decrypted)
	Headers          http.Header // all headers as received (preserve case via canonical keys)
	Body             []byte      // EXACT raw request body bytes
	Now              time.Time   // injected for deterministic timestamp checks; zero => time.Now()
	ToleranceSeconds int         // 0 => provider default (e.g. Stripe/Slack 300s)
}

// now returns Input.Now or the wall clock if unset. Verifiers should use this.
func (in Input) nowOr() time.Time {
	if in.Now.IsZero() {
		return time.Now()
	}
	return in.Now
}

// Now is the exported accessor verifiers use to get the effective time.
func (in Input) EffectiveNow() time.Time { return in.nowOr() }

// Result is the full, explainable outcome.
type Result struct {
	Provider Provider
	Status   Status
	Cause    Cause
	// Summary is a one-line, plain-English explanation for the UI, e.g.
	//   "scheme v1 · HMAC-SHA256 · timestamp within 300s · secret whsec_…matched"
	//   "timestamp skew 612s > 300s tolerance"
	//   "computed v1 ≠ header v1 (check you're signing the raw body, not a re-encoded copy)"
	Summary string
	// Details carries structured specifics for the detail pane / debugging, e.g.
	// {"scheme":"v1","algo":"HMAC-SHA256","skew_seconds":"612","computed":"5f3a…","provided":"a91c…"}.
	Details map[string]string
}

// Verifier verifies one provider's signature scheme.
type Verifier interface {
	Provider() Provider
	Verify(in Input) Result
}

// Registry maps providers to verifiers.
type Registry struct {
	verifiers map[Provider]Verifier
}

// NewRegistry returns an empty registry.
func NewRegistry() *Registry { return &Registry{verifiers: map[Provider]Verifier{}} }

// Register adds (or replaces) a verifier. Safe to call from init().
func (r *Registry) Register(v Verifier) { r.verifiers[v.Provider()] = v }

// Get returns the verifier for p, if registered.
func (r *Registry) Get(p Provider) (Verifier, bool) { v, ok := r.verifiers[p]; return v, ok }

// Providers lists the registered providers.
func (r *Registry) Providers() []Provider {
	out := make([]Provider, 0, len(r.verifiers))
	for p := range r.verifiers {
		out = append(out, p)
	}
	return out
}

// Default is the package-level registry the per-provider files populate via init().
var Default = NewRegistry()

// Verify dispatches to the registered verifier for in.Provider using Default.
// If no verifier is registered for the provider, it returns an Unknown/unsupported Result
// rather than erroring — callers get an explainable outcome in all cases.
func Verify(in Input) Result {
	v, ok := Default.Get(in.Provider)
	if !ok {
		return Result{
			Provider: in.Provider,
			Status:   Unknown,
			Cause:    CauseUnsupported,
			Summary:  "no verifier registered for provider " + string(in.Provider),
			Details:  map[string]string{},
		}
	}
	return v.Verify(in)
}

// Detect guesses the provider from characteristic request headers (e.g. a
// Stripe-Signature header => Stripe). Returns false if it cannot tell.
//
// STUB: the verify engine agent replaces this body with a real implementation
// covering all registered providers. Kept as a stable, compilable symbol so the
// rest of the backend can depend on it immediately.
func Detect(h http.Header) (Provider, bool) {
	if h == nil {
		return "", false
	}
	// Order matters: match the most specific, single-purpose headers first and
	// leave the generic Standard Webhooks headers (which require two headers to
	// corroborate) last, so a provider that also happens to set them is not
	// misclassified.
	switch {
	case h.Get("Stripe-Signature") != "":
		return Stripe, true
	case h.Get("X-Hub-Signature-256") != "" || h.Get("X-Hub-Signature") != "":
		return GitHub, true
	case h.Get("X-Razorpay-Signature") != "":
		return Razorpay, true
	case h.Get("X-Shopify-Hmac-Sha256") != "":
		return Shopify, true
	case h.Get("X-Slack-Signature") != "":
		return Slack, true
	case h.Get("Webhook-Signature") != "" && h.Get("Webhook-Id") != "" && h.Get("Webhook-Timestamp") != "":
		return StandardWebhooks, true
	}
	return "", false
}

// ---- Signing (used by replay/re-sign; inverse of verification) -------------
//
// Re-signing a captured event with a fresh timestamp lets a replay pass the
// receiver's replay-protection. Signing lives here (not in replay) so all
// per-provider scheme knowledge stays in one package and can be round-trip tested:
// Sign(payload) then Verify(payload) MUST yield Pass.

// SignInput describes a (re)sign request for one provider.
type SignInput struct {
	Provider Provider
	Secret   string    // signing secret to sign with
	Body     []byte    // exact raw body bytes to sign
	Now      time.Time // timestamp to embed (use a fresh time for re-sign); zero => time.Now()
}

func (s SignInput) EffectiveNow() time.Time {
	if s.Now.IsZero() {
		return time.Now()
	}
	return s.Now
}

// SignResult carries the headers the caller must set on the outgoing request so
// the receiver will verify it (e.g. {"Stripe-Signature": "t=...,v1=..."}).
type SignResult struct {
	Headers map[string]string
	Err     error
}

// Signer produces signature headers for one provider's scheme.
type Signer interface {
	Provider() Provider
	Sign(in SignInput) SignResult
}

// DefaultSigners is populated by the per-provider files via init().
var DefaultSigners = map[Provider]Signer{}

// RegisterSigner adds (or replaces) a signer in DefaultSigners.
func RegisterSigner(s Signer) { DefaultSigners[s.Provider()] = s }

// Sign dispatches to the registered signer for in.Provider.
func Sign(in SignInput) SignResult {
	s, ok := DefaultSigners[in.Provider]
	if !ok {
		return SignResult{Err: errUnsupportedSigner(in.Provider)}
	}
	return s.Sign(in)
}

type unsupportedSignerError struct{ p Provider }

func (e unsupportedSignerError) Error() string {
	return "no signer registered for provider " + string(e.p)
}

func errUnsupportedSigner(p Provider) error { return unsupportedSignerError{p} }
