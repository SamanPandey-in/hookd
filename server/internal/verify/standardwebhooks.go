package verify

// Standard Webhooks (Svix / Dodo Payments) signatures.
// Scheme (verified against the spec at
// https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md ,
// confirmed 2026-11-03):
//   Headers: webhook-id, webhook-timestamp (unix seconds),
//            webhook-signature: space-delimited list of "<version>,<base64>" (symmetric = v1).
//   Signed content = "<webhook-id>.<webhook-timestamp>.<rawbody>".
//   Symmetric secret is base64, prefixed "whsec_"; strip the prefix and
//   base64-decode the remainder to get the raw HMAC-SHA256 key. Digest is base64.
//   Replay tolerance: default 300s.

import (
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
)

const (
	swHeaderID   = "Webhook-Id"        // canonical form of "webhook-id"
	swHeaderTS   = "Webhook-Timestamp" // "webhook-timestamp"
	swHeaderSig  = "Webhook-Signature" // "webhook-signature"
	swSigVersion = "v1"
)

type standardWebhooksVerifier struct{}

func (standardWebhooksVerifier) Provider() Provider { return StandardWebhooks }

func (standardWebhooksVerifier) Verify(in Input) Result {
	sigHeader := strings.TrimSpace(in.Headers.Get(swHeaderSig))
	id := strings.TrimSpace(in.Headers.Get(swHeaderID))
	tsStr := strings.TrimSpace(in.Headers.Get(swHeaderTS))

	if sigHeader == "" {
		return result(StandardWebhooks, Unknown, CauseNoSignatureHeader,
			"no webhook-signature header on the request", nil)
	}
	if id == "" || tsStr == "" {
		return result(StandardWebhooks, Fail, CauseMalformedHeader,
			"Standard Webhooks requires webhook-id and webhook-timestamp alongside webhook-signature",
			map[string]string{"webhook_id_present": strconv.FormatBool(id != ""),
				"webhook_timestamp_present": strconv.FormatBool(tsStr != "")})
	}
	v1 := parseSWSignatures(sigHeader)
	if len(v1) == 0 {
		return result(StandardWebhooks, Fail, CauseMalformedHeader,
			"webhook-signature has no v1,<base64> entry",
			map[string]string{"header": clip(sigHeader)})
	}
	ts, tsOK := parseUnix(tsStr)
	if !tsOK {
		return result(StandardWebhooks, Fail, CauseMalformedHeader,
			"webhook-timestamp is not an integer unix time",
			map[string]string{"webhook_timestamp": clip(tsStr)})
	}
	if in.Secret == "" {
		return result(StandardWebhooks, Unknown, CauseMissingSecret,
			"no signing secret configured — paste your whsec_… secret to verify", nil)
	}
	key, keyOK := standardWebhooksKey(in.Secret)
	if !keyOK {
		return result(StandardWebhooks, Unknown, CauseMissingSecret,
			"secret is not valid base64 after the whsec_ prefix — check you copied the whole whsec_… value", nil)
	}

	signed := []byte(id + "." + tsStr + "." + string(in.Body))
	rawDigest := hmac256(key, signed)
	want := encode(encBase64, rawDigest)
	matched := ctAny(want, v1)

	d := map[string]string{
		"scheme":            swSigVersion,
		"algo":              algoSHA256,
		"encoding":          encBase64,
		"computed":          clip(want),
		"provided":          clip(firstOr(v1)),
		"tolerance_seconds": strconv.Itoa(toleranceOf(in)),
	}

	if matched {
		skew := skewSeconds(in.EffectiveNow(), ts)
		d["skew_seconds"] = strconv.FormatInt(skew, 10)
		if int(skew) > toleranceOf(in) {
			return result(StandardWebhooks, Fail, CauseTimestampSkew,
				"signature matched but timestamp skew "+strconv.FormatInt(skew, 10)+"s > "+
					strconv.Itoa(toleranceOf(in))+"s tolerance (stale/replayed event)", d)
		}
		return result(StandardWebhooks, Pass, CauseOK,
			"scheme v1 · "+algoSHA256+" · timestamp within "+strconv.Itoa(toleranceOf(in))+
				"s · secret "+secretHint(in.Secret)+"matched", d)
	}

	// Not matched: run the smart-hint classifier against the first v1 entry.
	cause, hd := classifyHMAC(rawDigest, firstOr(v1), encBase64, in.Body, func(b []byte) bool {
		return ctAny(encode(encBase64, hmac256(key, []byte(id+"."+tsStr+"."+string(b)))), v1)
	})
	for k, v := range hd {
		d[k] = v
	}
	switch cause {
	case CauseEncodingMismatch:
		return result(StandardWebhooks, Fail, CauseEncodingMismatch,
			"signature looks like "+otherLabel(encBase64)+" but Standard Webhooks uses "+encBase64+
				" — same digest, wrong encoding", d)
	case CauseBodyAltered:
		return result(StandardWebhooks, Fail, CauseBodyAltered,
			"computed signature ≠ header, but the body re-serialized would match — a parser likely "+
				"mutated the body; sign the raw bytes", d)
	default:
		return result(StandardWebhooks, Fail, CauseSignatureMismatch,
			"computed v1 ("+clip(want)+") ≠ header v1 — wrong secret or the signed content "+
				"(id.timestamp.body) differs", d)
	}
}

type standardWebhooksSigner struct{}

func (standardWebhooksSigner) Provider() Provider { return StandardWebhooks }

func (standardWebhooksSigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(StandardWebhooks)}
	}
	key, ok := standardWebhooksKey(in.Secret)
	if !ok {
		return SignResult{Err: signError("standard_webhooks secret is not valid base64 after whsec_ prefix")}
	}
	ts := strconv.FormatInt(in.EffectiveNow().Unix(), 10)
	// Deterministic, collision-resistant message id derived from body+timestamp
	// (no crypto/rand dependency; stays within the stdlib allowlist).
	idSum := sha256.Sum256(append([]byte(ts+"."), in.Body...))
	id := "msg_" + hexEnc(idSum[:])[:24]
	sig := b64Enc(hmac256(key, []byte(id+"."+ts+"."+string(in.Body))))
	return SignResult{Headers: map[string]string{
		swHeaderSig: swSigVersion + "," + sig,
		swHeaderID:  id,
		swHeaderTS:  ts,
	}}
}

func init() {
	Default.Register(standardWebhooksVerifier{})
	RegisterSigner(standardWebhooksSigner{})
}

// parseSWSignatures returns every base64 payload tagged as the symmetric v1
// version from a space-delimited webhook-signature header.
func parseSWSignatures(h string) []string {
	var out []string
	for _, tok := range strings.Fields(h) {
		kv := strings.SplitN(tok, ",", 2)
		if len(kv) == 2 && kv[0] == swSigVersion {
			out = append(out, kv[1])
		}
	}
	return out
}

// standardWebhooksKey derives the raw HMAC key from a "whsec_<base64>" secret.
// The whsec_ prefix is optional (Svix accepts the bare base64 too).
func standardWebhooksKey(secret string) ([]byte, bool) {
	s := strings.TrimPrefix(secret, "whsec_")
	key, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(key) == 0 {
		return nil, false
	}
	return key, true
}
