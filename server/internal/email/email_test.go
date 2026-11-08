package email

import (
	"context"
	"strings"
	"testing"
)

func TestInertByDefault(t *testing.T) {
	// No host/from => not configured => no-op sender, Send succeeds (inert).
	s := New(Config{})
	if _, ok := s.(noopSender); !ok {
		t.Fatalf("unconfigured New must return the no-op sender, got %T", s)
	}
	if (Config{}).Configured() {
		t.Fatal("empty config must report not configured")
	}
	if err := s.Send(context.Background(), Message{To: "x@y.com", Subject: "hi", Body: "secret body"}); err != nil {
		t.Fatalf("no-op send must succeed: %v", err)
	}
}

func TestConfiguredSelectsSMTP(t *testing.T) {
	s := New(Config{Host: "smtp.example.com", From: "hookd <no-reply@hookd.dev>"})
	if _, ok := s.(*smtpSender); !ok {
		t.Fatalf("configured New must return the smtp sender, got %T", s)
	}
}

func TestBuildMessageAndFromAddress(t *testing.T) {
	msg := buildMessage("hookd <no-reply@hookd.dev>", Message{To: "a@b.com", Subject: "subj", Body: "line1\nline2"})
	out := string(msg)
	for _, want := range []string{"From: hookd <no-reply@hookd.dev>", "To: a@b.com", "Subject: subj", "text/plain", "line1\nline2"} {
		if !strings.Contains(out, want) {
			t.Fatalf("message missing %q:\n%s", want, out)
		}
	}
	if got := fromAddress("hookd <no-reply@hookd.dev>"); got != "no-reply@hookd.dev" {
		t.Fatalf("fromAddress bare extraction: got %q", got)
	}
	if got := fromAddress("plain@hookd.dev"); got != "plain@hookd.dev" {
		t.Fatalf("fromAddress passthrough: got %q", got)
	}
}
