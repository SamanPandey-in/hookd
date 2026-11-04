package config

import (
	"context"
	"net"
	"os"
	"time"
)

// ApplyResolverOverride routes all Go DNS lookups through the server named in
// the DNS_RESOLVER env var (host:port, e.g. "8.8.8.8:53") when it is set.
//
// Why this exists: some locked-down networks and sandboxes run a local DNS
// resolver that REFUSES to answer for certain public hostnames (we hit this with
// Neon's compute endpoint, which resolves fine on 8.8.8.8/1.1.1.1 but is refused
// by the local resolver). Pointing Go's resolver at a public DNS server lets the
// app connect without touching the OS resolver config. No-op when DNS_RESOLVER is
// unset, so it is inert in normal/production environments.
func ApplyResolverOverride() {
	srv := os.Getenv("DNS_RESOLVER")
	if srv == "" {
		return
	}
	net.DefaultResolver = &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, _, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, "udp", srv)
		},
	}
}
