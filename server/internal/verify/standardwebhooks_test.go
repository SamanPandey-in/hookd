package verify

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

// Official Standard Webhooks / Svix published test vector (from the Svix
// libraries' shared test suite; construction matches the spec at
// github.com/standard-webhooks/standard-webhooks). Recomputed independently in a
// scratch program on 2026-11-03:
//
//	secret    whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw
//	webhook-id        msg_p5jXN8AQM9LWM0D4loKWxJek
//	webhook-timestamp 1614265330
//	payload   {"test": 2432232314}
//	=> webhook-signature: v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=
const (
	swVectorSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
	swVectorID     = "msg_p5jXN8AQM9LWM0D4loKWxJek"
	swVectorTS     = "1614265330"
	swVectorBody   = `{"test": 2432232314}`
	swVectorSig    = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="
)

func swTestKey(t *testing.T, secret string) []byte {
	t.Helper()
	k, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		t.Fatalf("decoding test secret: %v", err)
	}
	return k
}

func TestStandardWebhooks_OfficialVector(t *testing.T) {
	in := Input{Provider: StandardWebhooks, Secret: swVectorSecret, Body: []byte(swVectorBody),
		Headers: hdr(
			"webhook-id", swVectorID,
			"webhook-timestamp", swVectorTS,
			"webhook-signature", swVectorSig,
		),
		Now: time.Unix(1614265330, 0).UTC(),
	}
	assertResult(t, Verify(in), Pass, CauseOK)
}

func TestStandardWebhooks_Table(t *testing.T) {
	key := swTestKey(t, swVectorSecret)
	id, tsStr := "msg_abc", itoa64(fixedNow.Unix())
	body := `{"type":"subscription.active","data":{"id":"sub_1"}}`
	good := "v1," + macB64SHA256Key(key, id+"."+tsStr+"."+body)

	cases := []struct {
		name                string
		id, ts, sig, secret string
		body                string
		now                 time.Time
		wantStatus          Status
		wantCause           Cause
	}{
		{"pass", id, tsStr, good, swVectorSecret, body, fixedNow, Pass, CauseOK},
		{"no_signature_header", id, tsStr, "", swVectorSecret, body, fixedNow, Unknown, CauseNoSignatureHeader},
		{"malformed_missing_id", "", tsStr, good, swVectorSecret, body, fixedNow, Fail, CauseMalformedHeader},
		{"malformed_missing_ts", id, "", good, swVectorSecret, body, fixedNow, Fail, CauseMalformedHeader},
		{"malformed_no_v1", id, tsStr, "v2,abc", swVectorSecret, body, fixedNow, Fail, CauseMalformedHeader},
		{"missing_secret", id, tsStr, good, "", body, fixedNow, Unknown, CauseMissingSecret},
		{"bad_secret_base64", id, tsStr, good, "whsec_!!!notbase64!!!", body, fixedNow, Unknown, CauseMissingSecret},
		{"signature_mismatch", id, tsStr, "v1," + macB64SHA256Key([]byte("xxxx"), id+"."+tsStr+"."+body), swVectorSecret, body, fixedNow, Fail, CauseSignatureMismatch},
		{"timestamp_out_of_tolerance", id, tsStr, good, swVectorSecret, body, fixedNow.Add(400 * time.Second), Fail, CauseTimestampSkew},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hdr()
			if tc.id != "" {
				h.Set("webhook-id", tc.id)
			}
			if tc.ts != "" {
				h.Set("webhook-timestamp", tc.ts)
			}
			if tc.sig != "" {
				h.Set("webhook-signature", tc.sig)
			}
			in := Input{Provider: StandardWebhooks, Secret: tc.secret, Body: []byte(tc.body), Headers: h, Now: tc.now}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

func TestStandardWebhooks_MultipleSignatures(t *testing.T) {
	key := swTestKey(t, swVectorSecret)
	id, tsStr := "msg_multi", itoa64(fixedNow.Unix())
	body := `{"ok":true}`
	good := macB64SHA256Key(key, id+"."+tsStr+"."+body)
	header := "v1,aW52YWxpZHNpZ25hdHVyZXZhbHVlMDAwMDAwMDA= v1," + good // first wrong, second right
	in := Input{Provider: StandardWebhooks, Secret: swVectorSecret, Body: []byte(body),
		Headers: hdr("webhook-id", id, "webhook-timestamp", tsStr, "webhook-signature", header), Now: fixedNow}
	assertResult(t, Verify(in), Pass, CauseOK)
}

func TestStandardWebhooks_BodyAltered(t *testing.T) {
	key := swTestKey(t, swVectorSecret)
	id, tsStr := "msg_alt", itoa64(fixedNow.Unix())
	compact := `{"id":"evt_sw"}`
	pretty := "{\n  \"id\": \"evt_sw\"\n}"
	sig := "v1," + macB64SHA256Key(key, id+"."+tsStr+"."+compact)
	in := Input{Provider: StandardWebhooks, Secret: swVectorSecret, Body: []byte(pretty),
		Headers: hdr("webhook-id", id, "webhook-timestamp", tsStr, "webhook-signature", sig), Now: fixedNow}
	assertResult(t, Verify(in), Fail, CauseBodyAltered)
}
