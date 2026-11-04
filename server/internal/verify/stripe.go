package verify

// Stripe webhook signatures.
// Scheme (verified against https://docs.stripe.com/webhooks/signature and the
// "Resolve signature verification errors" docs, 2026-11-03):
//   Header: Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256>[,v1=...][,v0=...]
//   Signed payload = "<t>.<rawbody>"  (timestamp, a literal dot, then the raw body)
//   Digest: HMAC-SHA256, hex. Secret is used verbatim (incl. the "whsec_" prefix).
//   Default replay tolerance: 300s (5 minutes). Multiple v1 values can be listed
//   (during a secret roll Stripe emits one signature per active secret).

import (
	"strconv"
	"strings"
)

const stripeHeader = "Stripe-Signature"

type stripeVerifier struct{}

func (stripeVerifier) Provider() Provider { return Stripe }

func (stripeVerifier) Verify(in Input) Result {
	raw := in.Headers.Get(stripeHeader)
	if strings.TrimSpace(raw) == "" {
		return result(Stripe, Unknown, CauseNoSignatureHeader,
			"no Stripe-Signature header on the request", nil)
	}
	t, v1, ok := parseStripeSig(raw)
	if !ok {
		return result(Stripe, Fail, CauseMalformedHeader,
			"Stripe-Signature header is malformed (need t=<unix> and at least one v1=<hex>)",
			map[string]string{"header": clip(raw)})
	}
	if in.Secret == "" {
		return result(Stripe, Unknown, CauseMissingSecret,
			"no signing secret configured — paste your whsec_… endpoint secret to verify", nil)
	}
	ts, tsOK := parseUnix(t)
	if !tsOK {
		return result(Stripe, Fail, CauseMalformedHeader,
			"Stripe-Signature timestamp t="+clip(t)+" is not an integer unix time",
			map[string]string{"scheme": "v1", "t": clip(t)})
	}

	signed := []byte(t + "." + string(in.Body))
	rawDigest := hmac256([]byte(in.Secret), signed)

	cause, d := classifyHMAC(rawDigest, firstOr(v1), encHex, in.Body, func(b []byte) bool {
		return ctAny(encode(encHex, hmac256([]byte(in.Secret), []byte(t+"."+string(b)))), v1)
	})
	// classifyHMAC compared against the first v1 only; redo the positive check
	// across *all* listed v1 values (secret-roll emits several).
	want := encode(encHex, rawDigest)
	matched := ctAny(want, v1)
	d["scheme"] = "v1"
	d["algo"] = algoSHA256
	d["tolerance_seconds"] = strconv.Itoa(toleranceOf(in))

	if matched {
		// Signature is authentic; now enforce the replay window.
		skew := skewSeconds(in.EffectiveNow(), ts)
		d["skew_seconds"] = strconv.FormatInt(skew, 10)
		if int(skew) > toleranceOf(in) {
			return result(Stripe, Fail, CauseTimestampSkew,
				"signature matched but timestamp skew "+strconv.FormatInt(skew, 10)+"s > "+
					strconv.Itoa(toleranceOf(in))+"s tolerance (stale/replayed event)", d)
		}
		return result(Stripe, Pass, CauseOK,
			"scheme v1 · "+algoSHA256+" · timestamp within "+strconv.Itoa(toleranceOf(in))+
				"s · secret "+secretHint(in.Secret)+"matched", d)
	}

	switch cause {
	case CauseEncodingMismatch:
		return result(Stripe, Fail, CauseEncodingMismatch,
			"header v1 looks like "+otherLabel(encHex)+" but Stripe uses "+encHex+
				" — same digest, wrong encoding", d)
	case CauseBodyAltered:
		return result(Stripe, Fail, CauseBodyAltered,
			"computed v1 ≠ header v1, but the body re-serialized would match — a parser likely "+
				"mutated the body; sign the raw bytes", d)
	default:
		return result(Stripe, Fail, CauseSignatureMismatch,
			"computed v1 ("+clip(want)+") ≠ header v1 — wrong secret or the signed payload "+
				"differs (check you're signing the raw body, not a re-encoded copy)", d)
	}
}

type stripeSigner struct{}

func (stripeSigner) Provider() Provider { return Stripe }

func (stripeSigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(Stripe)}
	}
	t := strconv.FormatInt(in.EffectiveNow().Unix(), 10)
	sig := hexEnc(hmac256([]byte(in.Secret), []byte(t+"."+string(in.Body))))
	return SignResult{Headers: map[string]string{
		stripeHeader: "t=" + t + ",v1=" + sig,
	}}
}

func init() {
	Default.Register(stripeVerifier{})
	RegisterSigner(stripeSigner{})
}

// parseStripeSig extracts t and every v1 value from a Stripe-Signature header.
func parseStripeSig(h string) (t string, v1 []string, ok bool) {
	for _, part := range strings.Split(h, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			t = kv[1]
		case "v1":
			v1 = append(v1, kv[1])
		}
	}
	return t, v1, t != "" && len(v1) > 0
}

func firstOr(s []string) string {
	if len(s) == 0 {
		return ""
	}
	return s[0]
}
