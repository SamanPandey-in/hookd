package store_test

import (
	"os"
	"testing"

	"whook/internal/config"
)

// TestMain applies the DNS_RESOLVER override (if set) before any test runs, so
// the Postgres integration test can reach a database whose hostname the local
// resolver refuses (e.g. Neon from a locked-down network). Inert when unset.
func TestMain(m *testing.M) {
	config.ApplyResolverOverride()
	os.Exit(m.Run())
}
