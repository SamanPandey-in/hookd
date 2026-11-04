package verify

// Slack request signatures.
// Scheme (verified against
// https://docs.slack.dev/authentication/verifying-requests-from-slack , 2026-11-03):
//   Headers: X-Slack-Signature: v0=<hex HMAC-SHA256>
//            X-Slack-Request-Timestamp: <unix seconds>
//   Base string = "v0:<timestamp>:<rawbody>". Digest HMAC-SHA256, hex, "v0=" prefix.
//   Secret is the app signing secret, used verbatim. Replay tolerance: 300s.

import (
	"strconv"
	"strings"
)

const (
	slackHeaderSig = "X-Slack-Signature"
	slackHeaderTS  = "X-Slack-Request-Timestamp"
	slackVersion   = "v0"
)

type slackVerifier struct{}

func (slackVerifier) Provider() Provider { return Slack }

func (slackVerifier) Verify(in Input) Result {
	sig := strings.TrimSpace(in.Headers.Get(slackHeaderSig))
	tsStr := strings.TrimSpace(in.Headers.Get(slackHeaderTS))
	if sig == "" {
		return result(Slack, Unknown, CauseNoSignatureHeader,
			"no X-Slack-Signature header on the request", nil)
	}
	if tsStr == "" {
		return result(Slack, Fail, CauseMalformedHeader,
			"X-Slack-Request-Timestamp header is missing (required for the v0 base string)", nil)
	}
	if !strings.HasPrefix(sig, slackVersion+"=") {
		return result(Slack, Fail, CauseMalformedHeader,
			"X-Slack-Signature is malformed (expected \"v0=<hex>\")",
			map[string]string{"header": clip(sig)})
	}
	provided := strings.TrimPrefix(sig, slackVersion+"=")
	ts, tsOK := parseUnix(tsStr)
	if !tsOK {
		return result(Slack, Fail, CauseMalformedHeader,
			"X-Slack-Request-Timestamp is not an integer unix time",
			map[string]string{"timestamp": clip(tsStr)})
	}
	if in.Secret == "" {
		return result(Slack, Unknown, CauseMissingSecret,
			"no signing secret configured — paste your Slack app signing secret to verify", nil)
	}

	base := []byte(slackVersion + ":" + tsStr + ":" + string(in.Body))
	rawDigest := hmac256([]byte(in.Secret), base)
	want := encode(encHex, rawDigest)
	matched := ctEqualStr(provided, want)

	d := map[string]string{
		"scheme":            slackVersion,
		"algo":              algoSHA256,
		"encoding":          encHex,
		"computed":          clip(want),
		"provided":          clip(provided),
		"tolerance_seconds": strconv.Itoa(toleranceOf(in)),
	}

	if matched {
		skew := skewSeconds(in.EffectiveNow(), ts)
		d["skew_seconds"] = strconv.FormatInt(skew, 10)
		if int(skew) > toleranceOf(in) {
			return result(Slack, Fail, CauseTimestampSkew,
				"signature matched but timestamp skew "+strconv.FormatInt(skew, 10)+"s > "+
					strconv.Itoa(toleranceOf(in))+"s tolerance (stale/replayed request)", d)
		}
		return result(Slack, Pass, CauseOK,
			"scheme v0 · "+algoSHA256+" · timestamp within "+strconv.Itoa(toleranceOf(in))+
				"s · secret "+secretHint(in.Secret)+"matched", d)
	}

	cause, hd := classifyHMAC(rawDigest, provided, encHex, in.Body, func(b []byte) bool {
		return ctEqualStr(provided, encode(encHex, hmac256([]byte(in.Secret), []byte(slackVersion+":"+tsStr+":"+string(b)))))
	})
	for k, v := range hd {
		d[k] = v
	}
	switch cause {
	case CauseEncodingMismatch:
		return result(Slack, Fail, CauseEncodingMismatch,
			"signature looks like "+otherLabel(encHex)+" but Slack uses "+encHex+
				" — same digest, wrong encoding", d)
	case CauseBodyAltered:
		return result(Slack, Fail, CauseBodyAltered,
			"computed v0 ≠ header v0, but the body re-serialized would match — a parser likely "+
				"mutated the body; sign the raw bytes", d)
	default:
		return result(Slack, Fail, CauseSignatureMismatch,
			"computed v0 ("+clip(want)+") ≠ header v0 — wrong signing secret or the base string "+
				"(v0:timestamp:body) differs", d)
	}
}

type slackSigner struct{}

func (slackSigner) Provider() Provider { return Slack }

func (slackSigner) Sign(in SignInput) SignResult {
	if in.Secret == "" {
		return SignResult{Err: errNoSecret(Slack)}
	}
	ts := strconv.FormatInt(in.EffectiveNow().Unix(), 10)
	sig := hexEnc(hmac256([]byte(in.Secret), []byte(slackVersion+":"+ts+":"+string(in.Body))))
	return SignResult{Headers: map[string]string{
		slackHeaderSig: slackVersion + "=" + sig,
		slackHeaderTS:  ts,
	}}
}

func init() {
	Default.Register(slackVerifier{})
	RegisterSigner(slackSigner{})
}
