package migrations

import (
	"io/fs"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// Migrations must be named NNNN_name.sql with a zero-padded 4-digit prefix. That
// padding is what makes the runner's lexical sort (store.Migrate uses
// sort.Strings) equal a numeric sort — without it, "10_x.sql" would apply before
// "2_x.sql". This test guards that invariant plus the other ways a migration set
// silently breaks: empty files, duplicate versions, or none embedded at all.
func TestEmbeddedMigrationsAreWellFormed(t *testing.T) {
	nameRe := regexp.MustCompile(`^(\d{4})_[a-z0-9_]+\.sql$`)

	entries, err := fs.ReadDir(FS, ".")
	if err != nil {
		t.Fatalf("read embedded migrations dir: %v", err)
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	if len(files) == 0 {
		t.Fatal("no .sql migrations are embedded — the //go:embed glob matched nothing")
	}
	sort.Strings(files)

	seen := map[string]bool{}
	for _, name := range files {
		m := nameRe.FindStringSubmatch(name)
		if m == nil {
			t.Errorf("migration %q does not match NNNN_name.sql (4-digit prefix, lowercase name)", name)
			continue
		}
		if seen[m[1]] {
			t.Errorf("duplicate migration version %s (%q)", m[1], name)
		}
		seen[m[1]] = true

		b, err := fs.ReadFile(FS, name)
		if err != nil {
			t.Errorf("read %q: %v", name, err)
			continue
		}
		if strings.TrimSpace(string(b)) == "" {
			t.Errorf("migration %q is empty", name)
		}
	}

	// The schema must start at 0001 (the init migration).
	if first := nameRe.FindStringSubmatch(files[0]); first == nil || first[1] != "0001" {
		t.Errorf("first migration is %q, want it to start at 0001_*.sql", files[0])
	}
}
