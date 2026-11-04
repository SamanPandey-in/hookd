package replay

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
)

// fakeResolver maps hostnames to IPs for DNS-to-private tests.
type fakeResolver struct{ m map[string][]net.IP }

func (f fakeResolver) LookupIP(_ context.Context, host string) ([]net.IP, error) {
	if ips, ok := f.m[host]; ok {
		return ips, nil
	}
	return nil, errors.New("no such host")
}

func TestIsBlockedIP(t *testing.T) {
	cases := []struct {
		ip      string
		blocked bool
	}{
		// public — allowed
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"93.184.216.34", false}, // example.com
		{"2606:4700:4700::1111", false},
		// loopback
		{"127.0.0.1", true},
		{"127.5.5.5", true},
		{"::1", true},
		// private v4
		{"10.0.0.1", true},
		{"192.168.1.1", true},
		{"172.16.5.4", true},
		// link-local + metadata
		{"169.254.169.254", true},
		{"169.254.0.1", true},
		{"fe80::1", true},
		// ULA v6
		{"fc00::1", true},
		{"fd12:3456:789a::1", true},
		// cgnat
		{"100.64.0.1", true},
		// unspecified / mapped
		{"0.0.0.0", true},
		{"::ffff:127.0.0.1", true}, // IPv4-mapped loopback
		{"::ffff:10.0.0.1", true},  // IPv4-mapped private
	}
	for _, c := range cases {
		ip := net.ParseIP(c.ip)
		if ip == nil {
			t.Fatalf("bad test ip %q", c.ip)
		}
		got, why := isBlockedIP(ip)
		if got != c.blocked {
			t.Errorf("isBlockedIP(%s) = %v (%s), want %v", c.ip, got, why, c.blocked)
		}
	}
}

func TestValidateURLScheme(t *testing.T) {
	g := newGuardWithResolver(fakeResolver{m: map[string][]net.IP{
		"example.com": {net.ParseIP("93.184.216.34")},
	}})
	ctx := context.Background()

	if _, err := g.ValidateURL(ctx, "ftp://example.com/x"); err == nil {
		t.Error("ftp scheme should be blocked")
	}
	if _, err := g.ValidateURL(ctx, "file:///etc/passwd"); err == nil {
		t.Error("file scheme should be blocked")
	}
	if _, err := g.ValidateURL(ctx, "gopher://example.com"); err == nil {
		t.Error("gopher scheme should be blocked")
	}
	if _, err := g.ValidateURL(ctx, "https://example.com/webhook"); err != nil {
		t.Errorf("https public host should be allowed: %v", err)
	}
}

func TestValidateURLLiteralPrivateIP(t *testing.T) {
	g := NewGuard()
	ctx := context.Background()
	for _, raw := range []string{
		"http://127.0.0.1:9000/x",
		"http://10.0.0.5/x",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]:8080/x",
		"http://[fd00::1]/x",
		"http://192.168.0.1/x",
	} {
		if _, err := g.ValidateURL(ctx, raw); err == nil {
			t.Errorf("literal private/loopback %q should be blocked", raw)
		} else if !errors.Is(err, ErrBlockedTarget) {
			t.Errorf("%q: expected ErrBlockedTarget, got %v", raw, err)
		}
	}
}

func TestValidateURLDNSToPrivate(t *testing.T) {
	// A hostname that resolves to a private IP must be blocked (DNS rebinding /
	// internal-name attack).
	g := newGuardWithResolver(fakeResolver{m: map[string][]net.IP{
		"evil.example.com":  {net.ParseIP("10.1.2.3")},
		"mixed.example.com": {net.ParseIP("93.184.216.34"), net.ParseIP("127.0.0.1")},
		"good.example.com":  {net.ParseIP("93.184.216.34")},
	}})
	ctx := context.Background()

	if _, err := g.ValidateURL(ctx, "https://evil.example.com/webhook"); err == nil {
		t.Error("host resolving to private IP must be blocked")
	}
	// If ANY resolved IP is private, block (defends against multi-record attacks).
	if _, err := g.ValidateURL(ctx, "https://mixed.example.com/webhook"); err == nil {
		t.Error("host with a private IP among its records must be blocked")
	}
	if _, err := g.ValidateURL(ctx, "https://good.example.com/webhook"); err != nil {
		t.Errorf("fully-public host should be allowed: %v", err)
	}
}

func TestBlockedHostnames(t *testing.T) {
	g := NewGuard()
	ctx := context.Background()
	for _, raw := range []string{
		"http://localhost/x",
		"http://localhost:3000/x",
		"http://foo.localhost/x",
		"http://metadata.google.internal/x",
		"http://something.internal/x",
	} {
		if _, err := g.ValidateURL(ctx, raw); err == nil {
			t.Errorf("internal hostname %q should be blocked", raw)
		}
	}
}

func TestSafeDialContextRejectsPrivate(t *testing.T) {
	// The dialer must reject a connection whose host resolves to private space,
	// which is what defends against a redirect/rebind after validation.
	g := newGuardWithResolver(fakeResolver{m: map[string][]net.IP{
		"rebind.example.com": {net.ParseIP("10.9.9.9")},
	}})
	dial := g.safeDialContext(&net.Dialer{})
	_, err := dial(context.Background(), "tcp", "rebind.example.com:443")
	if err == nil {
		t.Fatal("dial to host resolving private should be rejected")
	}
	if !strings.Contains(err.Error(), "private") && !errors.Is(err, ErrBlockedTarget) {
		t.Errorf("expected block reason, got %v", err)
	}
}
