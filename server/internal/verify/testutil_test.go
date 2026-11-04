package verify

// Shared test helpers. Independent HMAC implementations live here so a PASS
// assertion cannot be satisfied by a bug shared between Sign and Verify — the
// test computes the expected signature itself, straight from crypto/hmac.

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strconv"
	"testing"
	"time"
)

func itoa64(n int64) string { return strconv.FormatInt(n, 10) }

// fixedNow is an arbitrary but stable instant used for deterministic timestamp
// tests (matches the Svix Standard Webhooks published vector's timestamp).
var fixedNow = time.Unix(1614265330, 0).UTC()

func hdr(pairs ...string) http.Header {
	h := http.Header{}
	for i := 0; i+1 < len(pairs); i += 2 {
		h.Set(pairs[i], pairs[i+1])
	}
	return h
}

func macHexSHA256(secret, msg string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(msg))
	return hex.EncodeToString(m.Sum(nil))
}

func macB64SHA256(secret, msg string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(msg))
	return base64.StdEncoding.EncodeToString(m.Sum(nil))
}

func macHexSHA256Key(key []byte, msg string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(msg))
	return hex.EncodeToString(m.Sum(nil))
}

func macB64SHA256Key(key []byte, msg string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(msg))
	return base64.StdEncoding.EncodeToString(m.Sum(nil))
}

func macHexSHA1(secret, msg string) string {
	m := hmac.New(sha1.New, []byte(secret))
	m.Write([]byte(msg))
	return hex.EncodeToString(m.Sum(nil))
}

// assertResult checks status + cause and fails with the full result on mismatch.
func assertResult(t *testing.T, got Result, wantStatus Status, wantCause Cause) {
	t.Helper()
	if got.Status != wantStatus || got.Cause != wantCause {
		t.Fatalf("got status=%q cause=%q (summary=%q, details=%v); want status=%q cause=%q",
			got.Status, got.Cause, got.Summary, got.Details, wantStatus, wantCause)
	}
	if got.Summary == "" {
		t.Errorf("empty Summary for status=%q cause=%q — every outcome must explain itself", got.Status, got.Cause)
	}
}
