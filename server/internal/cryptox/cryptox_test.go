package cryptox

import (
	"bytes"
	"strings"
	"testing"
)

func key32() []byte { return []byte("0123456789abcdef0123456789abcdef") }

func TestRoundTrip(t *testing.T) {
	c, err := New(key32())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	secrets := []string{"whsec_abc123", "", "a very long signing secret with spaces and symbols !@#$%^&*()"}
	for _, s := range secrets {
		enc, err := c.EncryptString(s)
		if err != nil {
			t.Fatalf("encrypt %q: %v", s, err)
		}
		got, err := c.DecryptString(enc)
		if err != nil {
			t.Fatalf("decrypt %q: %v", s, err)
		}
		if got != s {
			t.Fatalf("round trip mismatch: got %q want %q", got, s)
		}
	}
}

func TestNonceIsRandom(t *testing.T) {
	c, _ := New(key32())
	a, _ := c.EncryptString("same")
	b, _ := c.EncryptString("same")
	if bytes.Equal(a, b) {
		t.Fatal("two encryptions of the same plaintext produced identical ciphertext (nonce reuse)")
	}
}

func TestWrongKeyFails(t *testing.T) {
	c1, _ := New(key32())
	c2, _ := New([]byte("ffffffffffffffffffffffffffffffff"))
	enc, _ := c1.EncryptString("secret")
	if _, err := c2.DecryptString(enc); err == nil {
		t.Fatal("decrypt with wrong key should fail")
	}
}

func TestTamperFails(t *testing.T) {
	c, _ := New(key32())
	enc, _ := c.EncryptString("secret")
	enc[len(enc)-1] ^= 0xff
	if _, err := c.Decrypt(enc); err == nil {
		t.Fatal("tampered ciphertext should fail GCM auth")
	}
}

func TestBadKeySize(t *testing.T) {
	if _, err := New([]byte("short")); err == nil {
		t.Fatal("expected error for non-32-byte key")
	}
}

func TestMask(t *testing.T) {
	if m := Mask("whsec_abcdef123456"); !strings.HasPrefix(m, "whsec_") || strings.Contains(m, "123456") {
		t.Fatalf("mask leaked or malformed: %q", m)
	}
	if Mask("short") != "••••" {
		t.Fatalf("short secret should be fully redacted, got %q", Mask("short"))
	}
	if Mask("") != "" {
		t.Fatal("empty secret should mask to empty")
	}
}
