package verify

// Vercel webhook signatures.
// Scheme (per Vercel webhook docs, https://vercel.com/docs/webhooks/webhooks-api
// "Securing webhooks" / verify section, confirmed 2026-11-09):
//   Header: x-vercel-signature: <hex HMAC-SHA1> over the raw request body,
//   keyed by the webhook secret. No prefix, no timestamp.
//   Vercel's documented check is
//     crypto.createHmac('sha1', secret).update(rawBody).digest('hex')
//   compared against the x-vercel-signature header.
// (This is exactly GitHub's body-HMAC scheme but SHA-1 instead of SHA-256 and
//  without the "sha256=" prefix.)

import "strings"

const vercelHeader = "x-vercel-signature"

type vercelVerifier struct{}

func (vercelVerifier) Provider() Provider { return Vercel }

func (vercelVerifier) Verify(in Input) Result {
	sig := strings.TrimSpace(in.Headers.Get(vercelHeader))
	if sig == "" {
		return result(Vercel, Unknown, CauseNoSignatureHeader,
			"no x-vercel-signature header on the request", nil)
	}
	if in.Secret == "" {
		return result(Vercel, Unknown, CauseMissingSecret,
			"no webhook secret configured — paste your Vercel webhook secret to verify", nil)
	}

	rawDigest := hmac1([]byte(in.Secret), in.Body)
	cause, d := classifyHMAC(rawDigest, sig, encHex, in.Body, func(b []byte) bool {
		return ctEqualStr(sig, encode(encHex, hmac1([]byte(in.Secret), b)))
	})
	d["algo"] = algoSHA1

	switch cause {
	case CauseOK:
		return result(Vercel, Pass, CauseOK,
			algoSHA1+" · hex · secret "+secretHint(in.Secret)+"matched", d)
	case CauseEncodingMismatch:
		return result(Vercel, Fail, CauseEncodingMismatch,
			"signature looks like "+otherLabel(encHex)+" but Vercel uses "+encHex+
				" — same digest, wrong encoding", d)
	case CauseBodyAltered:
		return result(Vercel, Fail, CauseBodyAltered,
			"computed digest ≠ header, but the body re-serialized would match — a parser likely "+
				"mutated the body; verify against the raw bytes", d)
	default:
		return result(Vercel, Fail, CauseSignatureMismatch,
			"computed "+algoSHA1+" ("+clip(encode(encHex, rawDigest))+") ≠ header — wrong secret or altered body", d)
	}
}

type vercelSigner struct{}

func (vercelSigner) Provider() Provider { return Vercel }

func (vercelSigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(Vercel)}
	}
	return SignResult{Headers: map[string]string{
		vercelHeader: hexEnc(hmac1([]byte(in.Secret), in.Body)),
	}}
}

func init() {
	Default.Register(vercelVerifier{})
	RegisterSigner(vercelSigner{})
}
