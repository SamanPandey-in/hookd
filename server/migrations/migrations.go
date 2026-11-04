// Package migrations embeds the SQL migration files so the migration runner can
// apply them regardless of the process working directory.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
