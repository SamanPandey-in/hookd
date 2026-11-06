// Command server is the whook backend entrypoint. It loads config, opens the
// store (Postgres when DATABASE_URL is set, otherwise an in-memory dev store so
// the server still boots locally), runs migrations, assembles the HTTP handler,
// and serves it. Keeps /healthz for the always-on host smoke test.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"whook/internal/app"
	"whook/internal/auth"
	"whook/internal/config"
	"whook/internal/cryptox"
	"whook/internal/dodo"
	"whook/internal/replay"
	"whook/internal/retention"
	"whook/internal/sse"
	"whook/internal/store"
	"whook/migrations"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("whook: config error: %v", err)
	}
	config.ApplyResolverOverride() // honor DNS_RESOLVER in constrained networks (no-op when unset)

	cipher, err := cryptox.New(cfg.SecretEncKey)
	if err != nil {
		log.Fatalf("whook: cipher init: %v", err)
	}

	ctx := context.Background()

	var st store.Store
	if cfg.DatabaseURL != "" {
		pg, perr := store.NewPostgres(ctx, cfg.DatabaseURL)
		if perr != nil {
			log.Fatalf("whook: database: %v", perr)
		}
		if merr := store.Migrate(ctx, pg.Pool(), migrations.FS); merr != nil {
			log.Fatalf("whook: migrations: %v", merr)
		}
		st = pg
		log.Printf("whook: connected to Postgres, migrations applied")
	} else {
		st = store.NewFake()
		log.Printf("whook: WARNING no DATABASE_URL — running with in-memory store (dev only, data is not persisted)")
	}
	defer st.Close()

	if cfg.Dev {
		log.Printf("whook: WARNING dev mode — using insecure default SECRET_ENC_KEY/SESSION_KEY; set them in production")
	}

	var oauth auth.OAuthProvider
	if cfg.GitHubConfigured() {
		oauth = auth.NewLiveGitHub(cfg.GitHubClientID, cfg.GitHubClientSecret, cfg.GitHubCallbackURL)
		log.Printf("whook: GitHub OAuth configured")
	} else {
		log.Printf("whook: WARNING GitHub OAuth not configured (set GITHUB_CLIENT_ID/SECRET) — /auth/github/* will 503")
	}

	var dodoClient dodo.Client
	if cfg.DodoConfigured() {
		dodoClient = dodo.NewLive(cfg.DodoAPIKey, cfg.DodoBaseURL())
		log.Printf("whook: Dodo Payments configured (%s)", cfg.DodoEnvironment)
	} else {
		log.Printf("whook: WARNING Dodo not configured (set DODO_API_KEY) — /api/billing/* and /webhooks/dodo will 503; everyone is free")
	}
	if cfg.DodoConfigured() && !cfg.DodoWebhooksConfigured() {
		log.Printf("whook: WARNING DODO_WEBHOOK_SECRET unset — /webhooks/dodo will 503 (cannot verify Dodo webhooks)")
	}

	handler := app.New(app.Deps{
		Config: cfg,
		Store:  st,
		Cipher: cipher,
		Hub:    sse.NewHub(),
		Replay: replay.NewEngine(cfg.ReplayTimeout, cfg.MaxReplayRespBody),
		OAuth:  oauth,
		Dodo:   dodoClient,
	})

	srv := &http.Server{
		Addr:              cfg.BindAddr + ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: SSE streams are long-lived.
		IdleTimeout: 120 * time.Second,
	}

	purgeCtx, stopPurge := context.WithCancel(ctx)
	defer stopPurge()
	go retention.New(st).Run(purgeCtx, cfg.PurgeInterval)

	go func() {
		log.Printf("whook: listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("whook: server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Printf("whook: shutting down")
	stopPurge()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
