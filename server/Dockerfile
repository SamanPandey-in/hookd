# ── build stage ──────────────────────────────────────────────────────────────
# Pure-Go build (pgx, chi, oauth2 — no cgo), so we can ship a static binary on a
# distroless base with no libc.
FROM golang:1.27-alpine AS build
WORKDIR /src

# Cache modules first.
COPY go.mod go.sum ./
RUN go mod download

# Then the source.
COPY . .

ENV CGO_ENABLED=0 GOOS=linux
# Build both the server and the standalone migrate tool.
RUN go build -trimpath -ldflags="-s -w" -o /out/server  ./cmd/server \
 && go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

# ── runtime stage ────────────────────────────────────────────────────────────
# distroless/static ships CA certs (needed for TLS to Neon, GitHub, Dodo) and
# runs as a non-root user. No shell, minimal attack surface.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/server  /app/server
COPY --from=build /out/migrate /app/migrate

# The server also serves /healthz for load-balancer / compose health checks.
EXPOSE 8099
USER nonroot:nonroot
ENTRYPOINT ["/app/server"]
