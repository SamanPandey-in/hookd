// Command migrate applies the SQL migrations to the configured database and
// exits. Useful locally (`go run ./cmd/migrate` from server/, picking up .env)
// and on deploy (run once before starting the server).
package main

import (
	"context"
	"fmt"
	"log"

	"whook/internal/config"
	"whook/internal/store"
	"whook/migrations"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("migrate: config: %v", err)
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("migrate: DATABASE_URL is required")
	}
	config.ApplyResolverOverride() // honor DNS_RESOLVER in constrained networks

	ctx := context.Background()
	pg, err := store.NewPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("migrate: connect: %v", err)
	}
	defer pg.Close()

	if err := store.Migrate(ctx, pg.Pool(), migrations.FS); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	fmt.Println("migrate: all migrations applied OK")
}
