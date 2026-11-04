package verify

// Shopify webhook signatures.
// Scheme (per https://shopify.dev/docs/apps/build/webhooks/subscribe/https#verify-the-webhook ,
// confirmed 2026-11-03):
//   Header: X-Shopify-Hmac-Sha256: <base64 HMAC-SHA256> over the raw request body,
//   keyed by the app's client secret. No timestamp.
// Encoding note: Shopify emits **base64**, unlike Stripe/Razorpay/GitHub (hex) —
// this is the canonical hex-vs-base64 mix-up case the encoding_mismatch hint catches.

import "strings"

const shopifyHeader = "X-Shopify-Hmac-Sha256"

type shopifyVerifier struct{}

func (shopifyVerifier) Provider() Provider { return Shopify }

func (shopifyVerifier) Verify(in Input) Result {
	sig := strings.TrimSpace(in.Headers.Get(shopifyHeader))
	if sig == "" {
		return result(Shopify, Unknown, CauseNoSignatureHeader,
			"no X-Shopify-Hmac-Sha256 header on the request", nil)
	}
	if in.Secret == "" {
		return result(Shopify, Unknown, CauseMissingSecret,
			"no webhook secret configured — paste your Shopify app client secret to verify", nil)
	}

	rawDigest := hmac256([]byte(in.Secret), in.Body)
	cause, d := classifyHMAC(rawDigest, sig, encBase64, in.Body, func(b []byte) bool {
		return ctEqualStr(sig, encode(encBase64, hmac256([]byte(in.Secret), b)))
	})
	d["algo"] = algoSHA256

	switch cause {
	case CauseOK:
		return result(Shopify, Pass, CauseOK,
			algoSHA256+" · base64 · secret "+secretHint(in.Secret)+"matched", d)
	case CauseEncodingMismatch:
		return result(Shopify, Fail, CauseEncodingMismatch,
			"signature looks like "+otherLabel(encBase64)+" but Shopify uses "+encBase64+
				" — same digest, wrong encoding (Shopify is base64, not hex)", d)
	case CauseBodyAltered:
		return result(Shopify, Fail, CauseBodyAltered,
			"computed digest ≠ header, but the body re-serialized would match — a parser likely "+
				"mutated the body; verify against the raw bytes", d)
	default:
		return result(Shopify, Fail, CauseSignatureMismatch,
			"computed "+algoSHA256+" ("+clip(encode(encBase64, rawDigest))+") ≠ header — wrong secret or altered body", d)
	}
}

type shopifySigner struct{}

func (shopifySigner) Provider() Provider { return Shopify }

func (shopifySigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(Shopify)}
	}
	return SignResult{Headers: map[string]string{
		shopifyHeader: b64Enc(hmac256([]byte(in.Secret), in.Body)),
	}}
}

func init() {
	Default.Register(shopifyVerifier{})
	RegisterSigner(shopifySigner{})
}
