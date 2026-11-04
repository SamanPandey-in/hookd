package config

import (
	"encoding/base64"
	"testing"
)

func TestLoadDevDefaults(t *testing.T) {
	// No env set: dev mode with insecure defaults, must not error.
	t.Setenv("DATABASE_URL", "")
	t.Setenv("SECRET_ENC_KEY", "")
	t.Setenv("SESSION_KEY", "")
	c, err := Load()
	if err != nil {
		t.Fatalf("Load dev: %v", err)
	}
	if !c.Dev {
		t.Fatal("expected Dev=true with no DATABASE_URL")
	}
	if len(c.SecretEncKey) != 32 {
		t.Fatalf("dev key must be 32 bytes, got %d", len(c.SecretEncKey))
	}
	if c.Port != "8080" {
		t.Fatalf("default port, got %q", c.Port)
	}
}

func TestLoadProdRequiresSecretKey(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("SECRET_ENC_KEY", "")
	t.Setenv("SESSION_KEY", "a-session-key-long-enough")
	if _, err := Load(); err == nil {
		t.Fatal("expected error: SECRET_ENC_KEY required in prod")
	}
}

func TestLoadProdValid(t *testing.T) {
	key := base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef"))
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("SECRET_ENC_KEY", key)
	t.Setenv("SESSION_KEY", "a-session-key-long-enough")
	c, err := Load()
	if err != nil {
		t.Fatalf("Load prod: %v", err)
	}
	if c.Dev {
		t.Fatal("expected Dev=false with DATABASE_URL set")
	}
	if len(c.SecretEncKey) != 32 {
		t.Fatalf("key must decode to 32 bytes")
	}
}

func TestBadSecretKeyLength(t *testing.T) {
	key := base64.StdEncoding.EncodeToString([]byte("too-short"))
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("SECRET_ENC_KEY", key)
	t.Setenv("SESSION_KEY", "a-session-key-long-enough")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for wrong key length")
	}
}

func TestShortSessionKeyRejected(t *testing.T) {
	key := base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef"))
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("SECRET_ENC_KEY", key)
	t.Setenv("SESSION_KEY", "short")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for short session key")
	}
}
