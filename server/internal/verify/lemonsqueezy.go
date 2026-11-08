package verify

// Lemon Squeezy webhook signatures.
// Scheme (per Lemon Squeezy webhook docs,
// https://docs.lemonsqueezy.com/help/webhooks#signing-requests , confirmed
// 2026-11-09):
//   Header: X-Signature: <hex HMAC-SHA256> over the raw request body, keyed by
//   the webhook signing secret. No prefix, no timestamp.
//   Lemon Squeezy's documented check is
//     hash_hmac('sha256', rawBody, secret)
//   compared against the X-Signature header.
// (Byte-for-byte Razorpay's algorithm — hex HMAC-SHA256 over the raw body —
//  differing only in the header name: X-Signature vs X-Razorpay-Signature.)

import "strings"

const lemonSqueezyHeader = "X-Signature"

type lemonSqueezyVerifier struct{}

func (lemonSqueezyVerifier) Provider() Provider { return LemonSqueezy }

func (lemonSqueezyVerifier) Verify(in Input) Result {
	sig := strings.TrimSpace(in.Headers.Get(lemonSqueezyHeader))
	if sig == "" {
		return result(LemonSqueezy, Unknown, CauseNoSignatureHeader,
			"no X-Signature header on the request", nil)
	}
	if in.Secret == "" {
		return result(LemonSqueezy, Unknown, CauseMissingSecret,
			"no webhook secret configured — paste your Lemon Squeezy signing secret to verify", nil)
	}

	rawDigest := hmac256([]byte(in.Secret), in.Body)
	cause, d := classifyHMAC(rawDigest, sig, encHex, in.Body, func(b []byte) bool {
		return ctEqualStr(sig, encode(encHex, hmac256([]byte(in.Secret), b)))
	})
	d["algo"] = algoSHA256

	switch cause {
	case CauseOK:
		return result(LemonSqueezy, Pass, CauseOK,
			algoSHA256+" · hex · secret "+secretHint(in.Secret)+"matched", d)
	case CauseEncodingMismatch:
		return result(LemonSqueezy, Fail, CauseEncodingMismatch,
			"signature looks like "+otherLabel(encHex)+" but Lemon Squeezy uses "+encHex+
				" — same digest, wrong encoding", d)
	case CauseBodyAltered:
		return result(LemonSqueezy, Fail, CauseBodyAltered,
			"computed digest ≠ header, but the body re-serialized would match — a parser likely "+
				"mutated the body; verify against the raw bytes", d)
	default:
		return result(LemonSqueezy, Fail, CauseSignatureMismatch,
			"computed "+algoSHA256+" ("+clip(encode(encHex, rawDigest))+") ≠ header — wrong secret or altered body", d)
	}
}

type lemonSqueezySigner struct{}

func (lemonSqueezySigner) Provider() Provider { return LemonSqueezy }

func (lemonSqueezySigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(LemonSqueezy)}
	}
	return SignResult{Headers: map[string]string{
		lemonSqueezyHeader: hexEnc(hmac256([]byte(in.Secret), in.Body)),
	}}
}

func init() {
	Default.Register(lemonSqueezyVerifier{})
	RegisterSigner(lemonSqueezySigner{})
}
