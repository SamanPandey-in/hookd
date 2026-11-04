package verify

import (
	"testing"
	"time"
)

// Self-generated fixtures (Slack's published worked example truncates the body,
// so it is not reproducible). Construction "v0:ts:body" is confirmed from the
// Slack docs; expected hex HMAC-SHA256 computed independently in-test.
func TestSlack_Table(t *testing.T) {
	const secret = "8f742231b10e8888abcd99yyyzzz85a5"
	tsStr := itoa64(fixedNow.Unix())
	body := `token=xyz&team_id=T1&command=/weather`
	good := "v0=" + macHexSHA256(secret, "v0:"+tsStr+":"+body)

	cases := []struct {
		name       string
		sig, ts    string
		secret     string
		body       string
		now        time.Time
		wantStatus Status
		wantCause  Cause
	}{
		{"pass", good, tsStr, secret, body, fixedNow, Pass, CauseOK},
		{"no_signature_header", "", tsStr, secret, body, fixedNow, Unknown, CauseNoSignatureHeader},
		{"malformed_missing_ts", good, "", secret, body, fixedNow, Fail, CauseMalformedHeader},
		{"malformed_no_v0_prefix", macHexSHA256(secret, "v0:"+tsStr+":"+body), tsStr, secret, body, fixedNow, Fail, CauseMalformedHeader},
		{"missing_secret", good, tsStr, "", body, fixedNow, Unknown, CauseMissingSecret},
		{"signature_mismatch", "v0=" + macHexSHA256("wrong", "v0:"+tsStr+":"+body), tsStr, secret, body, fixedNow, Fail, CauseSignatureMismatch},
		{"timestamp_out_of_tolerance", good, tsStr, secret, body, fixedNow.Add(301 * time.Second), Fail, CauseTimestampSkew},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hdr()
			if tc.sig != "" {
				h.Set("X-Slack-Signature", tc.sig)
			}
			if tc.ts != "" {
				h.Set("X-Slack-Request-Timestamp", tc.ts)
			}
			in := Input{Provider: Slack, Secret: tc.secret, Body: []byte(tc.body), Headers: h, Now: tc.now}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

func TestSlack_BodyAltered(t *testing.T) {
	const secret = "8f742231b10e8888abcd99yyyzzz85a5"
	tsStr := itoa64(fixedNow.Unix())
	compact := `{"id":"slack_1"}`
	pretty := "{\n  \"id\": \"slack_1\"\n}"
	sig := "v0=" + macHexSHA256(secret, "v0:"+tsStr+":"+compact)
	in := Input{Provider: Slack, Secret: secret, Body: []byte(pretty),
		Headers: hdr("X-Slack-Signature", sig, "X-Slack-Request-Timestamp", tsStr), Now: fixedNow}
	assertResult(t, Verify(in), Fail, CauseBodyAltered)
}
