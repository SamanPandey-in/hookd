package verify

// Razorpay webhook signatures.
// Scheme (per Razorpay webhook docs, https://razorpay.com/docs/webhooks/ ,
// confirmed 2026-11-03):
//   Header: X-Razorpay-Signature: <hex HMAC-SHA256> over the raw request body,
//   keyed by the webhook secret. No "sha256=" prefix, no timestamp.
// (Note: this is the *webhook* scheme — signature over the raw body. Razorpay's
//  separate payment-link/checkout verification signs "order_id|payment_id"; that
//  is a different flow and not what inbound webhooks use.)

import "strings"

const razorpayHeader = "X-Razorpay-Signature"

type razorpayVerifier struct{}

func (razorpayVerifier) Provider() Provider { return Razorpay }

func (razorpayVerifier) Verify(in Input) Result {
	sig := strings.TrimSpace(in.Headers.Get(razorpayHeader))
	if sig == "" {
		return result(Razorpay, Unknown, CauseNoSignatureHeader,
			"no X-Razorpay-Signature header on the request", nil)
	}
	if in.Secret == "" {
		return result(Razorpay, Unknown, CauseMissingSecret,
			"no webhook secret configured — paste your Razorpay webhook secret to verify", nil)
	}

	rawDigest := hmac256([]byte(in.Secret), in.Body)
	cause, d := classifyHMAC(rawDigest, sig, encHex, in.Body, func(b []byte) bool {
		return ctEqualStr(sig, encode(encHex, hmac256([]byte(in.Secret), b)))
	})
	d["algo"] = algoSHA256

	switch cause {
	case CauseOK:
		return result(Razorpay, Pass, CauseOK,
			algoSHA256+" · hex · secret "+secretHint(in.Secret)+"matched", d)
	case CauseEncodingMismatch:
		return result(Razorpay, Fail, CauseEncodingMismatch,
			"signature looks like "+otherLabel(encHex)+" but Razorpay uses "+encHex+
				" — same digest, wrong encoding", d)
	case CauseBodyAltered:
		return result(Razorpay, Fail, CauseBodyAltered,
			"computed digest ≠ header, but the body re-serialized would match — a parser likely "+
				"mutated the body; verify against the raw bytes", d)
	default:
		return result(Razorpay, Fail, CauseSignatureMismatch,
			"computed "+algoSHA256+" ("+clip(encode(encHex, rawDigest))+") ≠ header — wrong secret or altered body", d)
	}
}

type razorpaySigner struct{}

func (razorpaySigner) Provider() Provider { return Razorpay }

func (razorpaySigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(Razorpay)}
	}
	return SignResult{Headers: map[string]string{
		razorpayHeader: hexEnc(hmac256([]byte(in.Secret), in.Body)),
	}}
}

func init() {
	Default.Register(razorpayVerifier{})
	RegisterSigner(razorpaySigner{})
}
