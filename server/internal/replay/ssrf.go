package replay

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// ErrBlockedTarget is returned when a target URL is rejected by the SSRF guard.
var ErrBlockedTarget = errors.New("replay: target blocked by SSRF guard")

// Resolver resolves a host to IPs; swapped in tests to simulate DNS.
type Resolver interface {
	LookupIP(ctx context.Context, host string) ([]net.IP, error)
}

type netResolver struct{ r *net.Resolver }

func (n netResolver) LookupIP(ctx context.Context, host string) ([]net.IP, error) {
	addrs, err := n.r.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	ips := make([]net.IP, 0, len(addrs))
	for _, a := range addrs {
		ips = append(ips, a.IP)
	}
	return ips, nil
}

// Guard validates user-supplied replay target URLs against SSRF. It enforces a
// scheme allowlist, blocks literal and DNS-resolved private/loopback/
// link-local/ULA/metadata addresses, and exposes a safe DialContext that
// re-checks every connection (defending against DNS rebinding and redirects
// into private space).
type Guard struct {
	resolver Resolver
	// allowPrivate, when true, skips the private-range checks. It is ONLY set by
	// tests that must reach a loopback httptest server; production NewGuard never
	// sets it.
	allowPrivate bool
}

// NewGuard returns a guard using the system resolver.
func NewGuard() *Guard {
	return &Guard{resolver: netResolver{r: net.DefaultResolver}}
}

// newGuardWithResolver is used by tests to inject a fake resolver.
func newGuardWithResolver(r Resolver) *Guard { return &Guard{resolver: r} }

// ValidateURL parses and checks a target URL: scheme allowlist + host present +
// every resolved IP is public. Returns the parsed URL on success.
func (g *Guard) ValidateURL(ctx context.Context, raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, fmt.Errorf("%w: unparseable URL", ErrBlockedTarget)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("%w: scheme %q not allowed (http/https only)", ErrBlockedTarget, u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return nil, fmt.Errorf("%w: missing host", ErrBlockedTarget)
	}
	// Reject obvious internal hostnames up front.
	if isBlockedHostname(host) {
		return nil, fmt.Errorf("%w: host %q is internal", ErrBlockedTarget, host)
	}

	ips, err := g.resolveHost(ctx, host)
	if err != nil {
		return nil, err
	}
	if !g.allowPrivate {
		for _, ip := range ips {
			if blocked, why := isBlockedIP(ip); blocked {
				return nil, fmt.Errorf("%w: %s resolves to %s (%s)", ErrBlockedTarget, host, ip, why)
			}
		}
	}
	return u, nil
}

// resolveHost returns the IPs for a host; a literal IP returns itself.
func (g *Guard) resolveHost(ctx context.Context, host string) ([]net.IP, error) {
	if ip := net.ParseIP(host); ip != nil {
		return []net.IP{ip}, nil
	}
	ips, err := g.resolver.LookupIP(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("%w: cannot resolve %q: %v", ErrBlockedTarget, host, err)
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("%w: %q resolved to no addresses", ErrBlockedTarget, host)
	}
	return ips, nil
}

// safeDialContext returns a DialContext that re-resolves and re-checks the IP at
// connection time, so a DNS rebinding between validation and dial, or a redirect
// to a new host, still cannot reach private space.
func (g *Guard) safeDialContext(base *net.Dialer) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		ips, err := g.resolveHost(ctx, host)
		if err != nil {
			return nil, err
		}
		if !g.allowPrivate {
			for _, ip := range ips {
				if blocked, why := isBlockedIP(ip); blocked {
					return nil, fmt.Errorf("%w: dial %s -> %s (%s)", ErrBlockedTarget, host, ip, why)
				}
			}
		}
		// Dial the already-validated IP directly to avoid a re-resolution race.
		return base.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
	}
}

func isBlockedHostname(host string) bool {
	h := strings.ToLower(strings.TrimSuffix(host, "."))
	switch h {
	case "localhost", "localhost.localdomain", "metadata", "metadata.google.internal":
		return true
	}
	// Block *.localhost and *.internal style internal TLDs.
	if strings.HasSuffix(h, ".localhost") || strings.HasSuffix(h, ".internal") {
		return true
	}
	return false
}

// isBlockedIP reports whether ip is in a range we must never connect to for a
// replay, with a human reason. Covers loopback, private (RFC1918), link-local,
// ULA (fc00::/7), the cloud metadata IPs, unspecified, multicast, and the
// IPv4-mapped forms of all of the above.
func isBlockedIP(ip net.IP) (bool, string) {
	if ip == nil {
		return true, "nil ip"
	}
	// Normalize IPv4-mapped IPv6 (::ffff:a.b.c.d) to IPv4 so v4 checks apply.
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	if ip.IsLoopback() {
		return true, "loopback"
	}
	if ip.IsUnspecified() {
		return true, "unspecified"
	}
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true, "link-local"
	}
	if ip.IsMulticast() {
		return true, "multicast"
	}
	if ip.IsPrivate() { // RFC1918 + RFC4193 ULA (fc00::/7)
		return true, "private"
	}
	// Cloud metadata endpoints (AWS/GCP/Azure 169.254.169.254 is link-local and
	// already caught; also block the IPv6 metadata address fd00:ec2::254).
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 169 && ip4[1] == 254 {
			return true, "metadata/link-local"
		}
		// 100.64.0.0/10 carrier-grade NAT — treat as internal.
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return true, "cgnat"
		}
	}
	if ip.Equal(net.ParseIP("fd00:ec2::254")) {
		return true, "metadata"
	}
	return false, ""
}
