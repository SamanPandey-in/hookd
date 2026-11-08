package verify

import (
	"net/http"
	"testing"
	"time"
)

// Independently-pinned Twitch EventSub vector. The signature below was computed
// OFFLINE (a standalone crypto/hmac program, NOT the package Sign) as
//
//	hex(HMAC-SHA256(secret, messageId + timestamp + body))
//
// so a PASS here cannot be satisfied by a bug shared between Sign and Verify.
const (
	twVecSecret = "twitchsecretsample0001"
	twVecID     = "e76d5f3c-1a2b-4c3d-9e8f-0a1b2c3d4e5f"
	twVecTS     = "2026-11-19T12:00:00Z"
	twVecBody   = `{"subscription":{"id":"f1a2b3c4-aaaa-bbbb-cccc-1234567890ab","type":"channel.follow","version":"2","status":"enabled","condition":{"broadcaster_user_id":"12345678"},"transport":{"method":"webhook","callback":"https://api.hookd.dev/i/ep_sample"},"created_at":"2026-11-19T11:59:00Z","cost":0},"event":{"user_id":"98765432","user_name":"cool_viewer","user_login":"cool_viewer","broadcaster_user_id":"12345678","broadcaster_user_name":"shipping_streamer","broadcaster_user_login":"shipping_streamer","followed_at":"2026-11-19T12:00:00Z"}}`
	// Pre-computed offline; the hex Twitch itself would send.
	twVecHex = "f432432ac1a81e5fb756a32412e5bc226082992356c32b6bc3059ed78fd7443d"
)

// twVecNow is "now" pinned to the vector timestamp so the tolerance check sees a
// zero skew (mirrors how the other timestamped providers inject the clock).
var twVecNow = time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)

func twitchHdr(id, ts, sig string) http.Header {
	h := http.Header{}
	if id != "" {
		h.Set(twitchHeaderID, id)
	}
	if ts != "" {
		h.Set(twitchHeaderTS, ts)
	}
	if sig != "" {
		h.Set(twitchHeaderSig, sig)
	}
	return h
}

// The pinned vector: the offline-computed hex both (a) equals an independent
// HMAC of id+ts+body and (b) verifies PASS as a sha256=<hex> header.
func TestTwitch_PinnedVector(t *testing.T) {
	// (a) The pinned hex is the real HMAC — confirmed by the test suite's own
	// independent HMAC implementation (not the package Sign).
	if got := macHexSHA256(twVecSecret, twVecID+twVecTS+twVecBody); got != twVecHex {
		t.Fatalf("pinned vector hex mismatch:\n got %s\nwant %s", got, twVecHex)
	}
	// (b) The sha256=<hex> header verifies PASS (clock pinned to the vector ts).
	in := Input{
		Provider: Twitch, Secret: twVecSecret, Body: []byte(twVecBody),
		Headers: twitchHdr(twVecID, twVecTS, "sha256="+twVecHex),
		Now:     twVecNow,
	}
	assertResult(t, Verify(in), Pass, CauseOK)
}

// Sign reproduces the scheme's hex: take the id+timestamp Sign chose and show an
// independent HMAC over (id+ts+body) equals the signature Sign emitted.
func TestTwitch_SignReproducesHex(t *testing.T) {
	sr := Sign(SignInput{Provider: Twitch, Secret: twVecSecret, Body: []byte(twVecBody), Now: twVecNow})
	if sr.Err != nil {
		t.Fatalf("Sign error: %v", sr.Err)
	}
	id := sr.Headers[twitchHeaderID]
	ts := sr.Headers[twitchHeaderTS]
	gotSig := sr.Headers[twitchHeaderSig]
	if id == "" || ts == "" || gotSig == "" {
		t.Fatalf("Sign produced incomplete headers: %v", sr.Headers)
	}
	want := "sha256=" + macHexSHA256(twVecSecret, id+ts+string(twVecBody))
	if gotSig != want {
		t.Fatalf("Sign signature mismatch:\n got %s\nwant %s", gotSig, want)
	}
	// Twitch emits a plain RFC3339 timestamp (so verifiers see a current clock).
	if _, err := time.Parse(time.RFC3339, ts); err != nil {
		t.Fatalf("Sign timestamp is not RFC3339: %q (%v)", ts, err)
	}
}

func TestTwitch_Table(t *testing.T) {
	goodSig := "sha256=" + twVecHex

	cases := []struct {
		name                string
		id, ts, sig, secret string
		body                string
		now                 time.Time
		wantStatus          Status
		wantCause           Cause
	}{
		{"pass", twVecID, twVecTS, goodSig, twVecSecret, twVecBody, twVecNow, Pass, CauseOK},
		{"tampered_body", twVecID, twVecTS, goodSig, twVecSecret, twVecBody + "!", twVecNow, Fail, CauseSignatureMismatch},
		{"wrong_secret", twVecID, twVecTS, goodSig, "not-the-secret", twVecBody, twVecNow, Fail, CauseSignatureMismatch},
		{"stale_timestamp", twVecID, twVecTS, goodSig, twVecSecret, twVecBody, twVecNow.Add(700 * time.Second), Fail, CauseTimestampSkew},
		{"malformed_signature", twVecID, twVecTS, "deadbeefnotprefixed", twVecSecret, twVecBody, twVecNow, Fail, CauseMalformedHeader},
		{"malformed_timestamp", twVecID, "not-a-time", goodSig, twVecSecret, twVecBody, twVecNow, Fail, CauseMalformedHeader},
		{"missing_signature", twVecID, twVecTS, "", twVecSecret, twVecBody, twVecNow, Unknown, CauseNoSignatureHeader},
		{"missing_id", "", twVecTS, goodSig, twVecSecret, twVecBody, twVecNow, Unknown, CauseNoSignatureHeader},
		{"missing_timestamp", twVecID, "", goodSig, twVecSecret, twVecBody, twVecNow, Unknown, CauseNoSignatureHeader},
		{"missing_secret", twVecID, twVecTS, goodSig, "", twVecBody, twVecNow, Unknown, CauseMissingSecret},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := Input{
				Provider: Twitch, Secret: tc.secret, Body: []byte(tc.body),
				Headers: twitchHdr(tc.id, tc.ts, tc.sig), Now: tc.now,
			}
			assertResult(t, Verify(in), tc.wantStatus, tc.wantCause)
		})
	}
}

// Sign → Verify must PASS with a fresh timestamp; a body tamper must not PASS.
func TestTwitch_RoundTrip(t *testing.T) {
	body := []byte(`{"subscription":{"type":"stream.online"},"event":{"id":"evt_rt"}}`)
	sr := Sign(SignInput{Provider: Twitch, Secret: "twitch_rt_secret", Body: body, Now: twVecNow})
	if sr.Err != nil {
		t.Fatalf("Sign error: %v", sr.Err)
	}
	h := http.Header{}
	for k, v := range sr.Headers {
		h.Set(k, v)
	}
	assertResult(t, Verify(Input{Provider: Twitch, Secret: "twitch_rt_secret", Body: body, Headers: h, Now: twVecNow}), Pass, CauseOK)

	tampered := append(append([]byte{}, body...), '!')
	if got := Verify(Input{Provider: Twitch, Secret: "twitch_rt_secret", Body: tampered, Headers: h, Now: twVecNow}); got.Status == Pass {
		t.Fatal("tampered body returned Pass — false verified is a product-destroying bug")
	}
}

// A stale original fails on skew; re-signing with a fresh timestamp passes.
func TestTwitch_ResignRefreshesTimestamp(t *testing.T) {
	body := []byte(`{"subscription":{"type":"channel.follow"},"event":{"id":"evt_stale"}}`)
	stale := twVecNow.Add(-2 * time.Hour)
	orig := Sign(SignInput{Provider: Twitch, Secret: "twitch_rt_secret", Body: body, Now: stale})
	h := http.Header{}
	for k, v := range orig.Headers {
		h.Set(k, v)
	}
	if got := Verify(Input{Provider: Twitch, Secret: "twitch_rt_secret", Body: body, Headers: h, Now: twVecNow}); got.Cause != CauseTimestampSkew {
		t.Fatalf("expected stale original to fail on timestamp skew, got %q (%s)", got.Cause, got.Summary)
	}
	fresh := Sign(SignInput{Provider: Twitch, Secret: "twitch_rt_secret", Body: body, Now: twVecNow})
	h2 := http.Header{}
	for k, v := range fresh.Headers {
		h2.Set(k, v)
	}
	assertResult(t, Verify(Input{Provider: Twitch, Secret: "twitch_rt_secret", Body: body, Headers: h2, Now: twVecNow}), Pass, CauseOK)
}

func TestTwitch_Detect(t *testing.T) {
	got, ok := Detect(twitchHdr(twVecID, twVecTS, "sha256="+twVecHex))
	if !ok || got != Twitch {
		t.Fatalf("Detect = (%q, %v); want (%q, true)", got, ok, Twitch)
	}
	// The lone signature header is enough to identify Twitch.
	got2, ok2 := Detect(hdr(twitchHeaderSig, "sha256=abc"))
	if !ok2 || got2 != Twitch {
		t.Fatalf("Detect(sig only) = (%q, %v); want (%q, true)", got2, ok2, Twitch)
	}
}
