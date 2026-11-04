package verify

// GitHub webhook signatures.
// Scheme (verified against
// https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries,
// 2026-11-03):
//   Header: X-Hub-Signature-256: sha256=<hex HMAC-SHA256> over the raw body.
//   Legacy: X-Hub-Signature: sha1=<hex HMAC-SHA1> over the raw body.
//   Secret is used verbatim as the HMAC key. No timestamp / replay window.
// Official worked example (cited in github_test.go):
//   secret "It's a Secret to Everybody", body "Hello, World!"
//   => sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17

import "strings"

const (
	githubHeader256 = "X-Hub-Signature-256"
	githubHeader1   = "X-Hub-Signature"
)

type githubVerifier struct{}

func (githubVerifier) Provider() Provider { return GitHub }

func (githubVerifier) Verify(in Input) Result {
	h256 := strings.TrimSpace(in.Headers.Get(githubHeader256))
	h1 := strings.TrimSpace(in.Headers.Get(githubHeader1))
	if h256 == "" && h1 == "" {
		return result(GitHub, Unknown, CauseNoSignatureHeader,
			"no X-Hub-Signature-256 (or legacy X-Hub-Signature) header on the request", nil)
	}

	// Prefer the modern SHA-256 header; fall back to legacy SHA-1.
	header, prefix, algo := githubHeader256, "sha256=", algoSHA256
	provided := h256
	if h256 == "" {
		header, prefix, algo = githubHeader1, "sha1=", algoSHA1
		provided = h1
	}
	if !strings.HasPrefix(provided, prefix) {
		return result(GitHub, Fail, CauseMalformedHeader,
			header+" is malformed (expected \""+prefix+"<hex>\")",
			map[string]string{"header": clip(provided)})
	}
	sig := strings.TrimPrefix(provided, prefix)
	if in.Secret == "" {
		return result(GitHub, Unknown, CauseMissingSecret,
			"no webhook secret configured — paste the secret you set on the GitHub webhook to verify", nil)
	}

	mac := func(b []byte) []byte {
		if algo == algoSHA1 {
			return hmac1([]byte(in.Secret), b)
		}
		return hmac256([]byte(in.Secret), b)
	}
	rawDigest := mac(in.Body)
	cause, d := classifyHMAC(rawDigest, sig, encHex, in.Body, func(b []byte) bool {
		return ctEqualStr(sig, encode(encHex, mac(b)))
	})
	d["algo"] = algo
	d["header"] = header

	switch cause {
	case CauseOK:
		return result(GitHub, Pass, CauseOK,
			header+" · "+algo+" · hex · secret "+secretHint(in.Secret)+"matched", d)
	case CauseEncodingMismatch:
		return result(GitHub, Fail, CauseEncodingMismatch,
			"signature looks like "+otherLabel(encHex)+" but GitHub uses "+encHex+
				" — same digest, wrong encoding", d)
	case CauseBodyAltered:
		return result(GitHub, Fail, CauseBodyAltered,
			"computed digest ≠ header, but the body re-serialized would match — a parser likely "+
				"mutated the body; verify against the raw bytes", d)
	default:
		return result(GitHub, Fail, CauseSignatureMismatch,
			"computed "+algo+" ("+clip(encode(encHex, rawDigest))+") ≠ header — wrong secret or altered body", d)
	}
}

type githubSigner struct{}

func (githubSigner) Provider() Provider { return GitHub }

func (githubSigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(GitHub)}
	}
	sig := hexEnc(hmac256([]byte(in.Secret), in.Body))
	return SignResult{Headers: map[string]string{
		githubHeader256: "sha256=" + sig,
	}}
}

func init() {
	Default.Register(githubVerifier{})
	RegisterSigner(githubSigner{})
}
