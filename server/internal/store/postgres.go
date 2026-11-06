package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres is a pgx-backed Store.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewPostgres connects to the database at url and returns a Store. The caller
// should run Migrate after connecting.
func NewPostgres(ctx context.Context, url string) (*Postgres, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("store: parse DATABASE_URL: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("store: connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("store: ping: %w", err)
	}
	return &Postgres{pool: pool}, nil
}

// Pool exposes the underlying pool (used by the migration runner).
func (p *Postgres) Pool() *pgxpool.Pool { return p.pool }

// Close closes the pool.
func (p *Postgres) Close() { p.pool.Close() }

func (p *Postgres) UpsertUserByGitHub(ctx context.Context, githubID int64, login, email string) (*User, error) {
	var u User
	err := p.pool.QueryRow(ctx, `
		INSERT INTO users (github_id, login, email)
		VALUES ($1, $2, $3)
		ON CONFLICT (github_id) DO UPDATE SET login = EXCLUDED.login, email = EXCLUDED.email
		RETURNING id, github_id, login, email, created_at`,
		githubID, login, email,
	).Scan(&u.ID, &u.GitHubID, &u.Login, &u.Email, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("store: upsert user: %w", err)
	}
	// Upsert does not touch billing columns; a caller needing plan state reads
	// the user back via GetUser. Default the in-memory value so it is never "".
	if u.Plan == "" {
		u.Plan = "free"
	}
	return &u, nil
}

func (p *Postgres) GetUser(ctx context.Context, id int64) (*User, error) {
	return p.scanUserWhere(ctx, "id=$1", id)
}

func (p *Postgres) GetUserByDodoCustomerID(ctx context.Context, customerID string) (*User, error) {
	if customerID == "" {
		return nil, ErrNotFound
	}
	return p.scanUserWhere(ctx, "dodo_customer_id=$1", customerID)
}

// scanUserWhere loads one user row (including billing columns) by a WHERE clause.
func (p *Postgres) scanUserWhere(ctx context.Context, where string, args ...any) (*User, error) {
	var u User
	err := p.pool.QueryRow(ctx, `
		SELECT id, github_id, login, email, avatar_url, name, created_at,
		       plan, dodo_customer_id, sub_id, sub_status,
		       sub_current_period_end_ms, sub_cancel_at_period_end
		FROM users WHERE `+where, args...,
	).Scan(&u.ID, &u.GitHubID, &u.Login, &u.Email, &u.AvatarURL, &u.Name, &u.CreatedAt,
		&u.Plan, &u.DodoCustomerID, &u.Subscription.ID, &u.Subscription.Status,
		&u.Subscription.CurrentPeriodEnd, &u.Subscription.CancelAtPeriodEnd)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: get user: %w", err)
	}
	if u.Plan == "" {
		u.Plan = "free"
	}
	return &u, nil
}

func (p *Postgres) UpdateUserProfile(ctx context.Context, userID int64, avatarURL, name string) error {
	ct, err := p.pool.Exec(ctx, `UPDATE users SET avatar_url=$2, name=$3 WHERE id=$1`, userID, avatarURL, name)
	if err != nil {
		return fmt.Errorf("store: update user profile: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteAccount removes the user; all owned rows cascade via ON DELETE CASCADE
// (endpoints -> events -> replay_attempts, api_keys, activity). Wrapped in a tx.
func (p *Postgres) DeleteAccount(ctx context.Context, userID int64) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("store: begin delete-account tx: %w", err)
	}
	defer tx.Rollback(ctx)
	ct, err := tx.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
	if err != nil {
		return fmt.Errorf("store: delete account: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("store: commit delete-account tx: %w", err)
	}
	return nil
}

func (p *Postgres) SetUserDodoCustomer(ctx context.Context, userID int64, customerID string) error {
	ct, err := p.pool.Exec(ctx, `UPDATE users SET dodo_customer_id=$2 WHERE id=$1`, userID, customerID)
	if err != nil {
		return fmt.Errorf("store: set dodo customer: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) UpdateUserSubscription(ctx context.Context, userID int64, plan string, sub Subscription) error {
	ct, err := p.pool.Exec(ctx, `
		UPDATE users
		SET plan=$2, sub_id=$3, sub_status=$4, sub_current_period_end_ms=$5, sub_cancel_at_period_end=$6
		WHERE id=$1`,
		userID, plan, sub.ID, sub.Status, sub.CurrentPeriodEnd, sub.CancelAtPeriodEnd)
	if err != nil {
		return fmt.Errorf("store: update subscription: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) MarkWebhookProcessed(ctx context.Context, webhookID string) (bool, error) {
	ct, err := p.pool.Exec(ctx,
		`INSERT INTO processed_webhooks (webhook_id) VALUES ($1) ON CONFLICT (webhook_id) DO NOTHING`,
		webhookID)
	if err != nil {
		return false, fmt.Errorf("store: mark webhook processed: %w", err)
	}
	return ct.RowsAffected() == 1, nil
}

func (p *Postgres) CreateEndpoint(ctx context.Context, e *Endpoint) error {
	if e.ID == "" {
		e.ID = NewToken(16)
	}
	if e.Response.Status == 0 {
		e.Response = DefaultResponseRule()
	}
	if e.RetentionDays == 0 {
		e.RetentionDays = 7
	}
	hdrs, err := json.Marshal(nonNilMap(e.Response.Headers))
	if err != nil {
		return fmt.Errorf("store: marshal response headers: %w", err)
	}
	err = p.pool.QueryRow(ctx, `
		INSERT INTO endpoints (id, owner_id, name, provider, response_status, response_headers, response_body, retention_days)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING created_at`,
		e.ID, e.OwnerID, e.Name, e.Provider, e.Response.Status, hdrs, e.Response.Body, e.RetentionDays,
	).Scan(&e.CreatedAt)
	if err != nil {
		return fmt.Errorf("store: create endpoint: %w", err)
	}
	return nil
}

func (p *Postgres) GetEndpoint(ctx context.Context, id string) (*Endpoint, error) {
	var (
		e         Endpoint
		hdrs      []byte
		secretEnc []byte
	)
	err := p.pool.QueryRow(ctx, `
		SELECT id, owner_id, name, provider, signing_secret_enc, secret_mask,
		       response_status, response_headers, response_body, retention_days, created_at
		FROM endpoints WHERE id=$1`, id,
	).Scan(&e.ID, &e.OwnerID, &e.Name, &e.Provider, &secretEnc, &e.SecretMask,
		&e.Response.Status, &hdrs, &e.Response.Body, &e.RetentionDays, &e.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: get endpoint: %w", err)
	}
	if err := json.Unmarshal(hdrs, &e.Response.Headers); err != nil {
		return nil, fmt.Errorf("store: unmarshal response headers: %w", err)
	}
	e.HasSecret = len(secretEnc) > 0
	return &e, nil
}

func (p *Postgres) ListEndpoints(ctx context.Context, ownerID int64) ([]*Endpoint, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id, owner_id, name, provider, signing_secret_enc, secret_mask,
		       response_status, response_headers, response_body, retention_days, created_at
		FROM endpoints WHERE owner_id=$1 ORDER BY created_at DESC`, ownerID)
	if err != nil {
		return nil, fmt.Errorf("store: list endpoints: %w", err)
	}
	defer rows.Close()
	var out []*Endpoint
	for rows.Next() {
		var (
			e         Endpoint
			hdrs      []byte
			secretEnc []byte
		)
		if err := rows.Scan(&e.ID, &e.OwnerID, &e.Name, &e.Provider, &secretEnc, &e.SecretMask,
			&e.Response.Status, &hdrs, &e.Response.Body, &e.RetentionDays, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("store: scan endpoint: %w", err)
		}
		if err := json.Unmarshal(hdrs, &e.Response.Headers); err != nil {
			return nil, fmt.Errorf("store: unmarshal response headers: %w", err)
		}
		e.HasSecret = len(secretEnc) > 0
		out = append(out, &e)
	}
	return out, rows.Err()
}

func (p *Postgres) UpdateEndpoint(ctx context.Context, e *Endpoint) error {
	hdrs, err := json.Marshal(nonNilMap(e.Response.Headers))
	if err != nil {
		return fmt.Errorf("store: marshal response headers: %w", err)
	}
	ct, err := p.pool.Exec(ctx, `
		UPDATE endpoints
		SET name=$2, provider=$3, response_status=$4, response_headers=$5, response_body=$6, retention_days=$7
		WHERE id=$1`,
		e.ID, e.Name, e.Provider, e.Response.Status, hdrs, e.Response.Body, e.RetentionDays)
	if err != nil {
		return fmt.Errorf("store: update endpoint: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) DeleteEndpoint(ctx context.Context, id string, ownerID int64) error {
	ct, err := p.pool.Exec(ctx, `DELETE FROM endpoints WHERE id=$1 AND owner_id=$2`, id, ownerID)
	if err != nil {
		return fmt.Errorf("store: delete endpoint: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) SetEndpointSecret(ctx context.Context, id string, enc []byte, mask string) error {
	ct, err := p.pool.Exec(ctx,
		`UPDATE endpoints SET signing_secret_enc=$2, secret_mask=$3 WHERE id=$1`, id, enc, mask)
	if err != nil {
		return fmt.Errorf("store: set endpoint secret: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) GetEndpointSecret(ctx context.Context, id string) ([]byte, error) {
	var enc []byte
	err := p.pool.QueryRow(ctx, `SELECT signing_secret_enc FROM endpoints WHERE id=$1`, id).Scan(&enc)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: get endpoint secret: %w", err)
	}
	return enc, nil
}

func (p *Postgres) CreateEvent(ctx context.Context, ev *Event) error {
	if ev.ID == "" {
		ev.ID = NewToken(16)
	}
	hdrs, err := json.Marshal(ev.Headers)
	if err != nil {
		return fmt.Errorf("store: marshal headers: %w", err)
	}
	details, err := json.Marshal(nonNilMap(ev.VerifyDetails))
	if err != nil {
		return fmt.Errorf("store: marshal verify details: %w", err)
	}
	_, err = p.pool.Exec(ctx, `
		INSERT INTO events (id, endpoint_id, method, path, query, headers, raw_body, size,
			content_type, source_ip, received_at_ms, verify_status, verify_cause, verify_summary, verify_details, event_type)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		ev.ID, ev.EndpointID, ev.Method, ev.Path, ev.Query, hdrs, ev.RawBody, ev.Size,
		ev.ContentType, ev.SourceIP, ev.ReceivedAtMS, ev.VerifyStatus, ev.VerifyCause, ev.VerifySummary, details, ev.EventType)
	if err != nil {
		return fmt.Errorf("store: create event: %w", err)
	}
	return nil
}

func (p *Postgres) GetEvent(ctx context.Context, id string) (*Event, error) {
	return p.scanEventWhere(ctx, "id=$1", id)
}

func (p *Postgres) scanEventWhere(ctx context.Context, where string, args ...any) (*Event, error) {
	var (
		ev      Event
		hdrs    []byte
		details []byte
	)
	q := `SELECT id, endpoint_id, method, path, query, headers, raw_body, size,
		content_type, source_ip, received_at_ms, verify_status, verify_cause, verify_summary, verify_details, event_type
		FROM events WHERE ` + where
	err := p.pool.QueryRow(ctx, q, args...).Scan(
		&ev.ID, &ev.EndpointID, &ev.Method, &ev.Path, &ev.Query, &hdrs, &ev.RawBody, &ev.Size,
		&ev.ContentType, &ev.SourceIP, &ev.ReceivedAtMS, &ev.VerifyStatus, &ev.VerifyCause, &ev.VerifySummary, &details, &ev.EventType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: get event: %w", err)
	}
	if err := json.Unmarshal(hdrs, &ev.Headers); err != nil {
		return nil, fmt.Errorf("store: unmarshal headers: %w", err)
	}
	if err := json.Unmarshal(details, &ev.VerifyDetails); err != nil {
		return nil, fmt.Errorf("store: unmarshal verify details: %w", err)
	}
	return &ev, nil
}

func (p *Postgres) ListEvents(ctx context.Context, endpointID string, f EventFilter) ([]*Event, error) {
	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var (
		conds = []string{"endpoint_id = $1"}
		args  = []any{endpointID}
	)
	add := func(cond string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(cond, len(args)))
	}
	if f.Method != "" {
		add("method = $%d", strings.ToUpper(f.Method))
	}
	if f.VerifyStatus != "" {
		add("verify_status = $%d", f.VerifyStatus)
	}
	if f.Text != "" {
		add("position(lower($%d) in lower(convert_from(raw_body, 'UTF8'))) > 0", f.Text)
	}
	if f.BeforeMS > 0 {
		add("received_at_ms < $%d", f.BeforeMS)
	}
	args = append(args, limit)
	q := `SELECT id, endpoint_id, method, path, query, headers, raw_body, size,
		content_type, source_ip, received_at_ms, verify_status, verify_cause, verify_summary, verify_details, event_type
		FROM events WHERE ` + strings.Join(conds, " AND ") +
		fmt.Sprintf(" ORDER BY received_at_ms DESC LIMIT $%d", len(args))

	rows, err := p.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("store: list events: %w", err)
	}
	defer rows.Close()
	var out []*Event
	for rows.Next() {
		var (
			ev      Event
			hdrs    []byte
			details []byte
		)
		if err := rows.Scan(&ev.ID, &ev.EndpointID, &ev.Method, &ev.Path, &ev.Query, &hdrs, &ev.RawBody, &ev.Size,
			&ev.ContentType, &ev.SourceIP, &ev.ReceivedAtMS, &ev.VerifyStatus, &ev.VerifyCause, &ev.VerifySummary, &details, &ev.EventType); err != nil {
			return nil, fmt.Errorf("store: scan event: %w", err)
		}
		if err := json.Unmarshal(hdrs, &ev.Headers); err != nil {
			return nil, fmt.Errorf("store: unmarshal headers: %w", err)
		}
		if err := json.Unmarshal(details, &ev.VerifyDetails); err != nil {
			return nil, fmt.Errorf("store: unmarshal verify details: %w", err)
		}
		out = append(out, &ev)
	}
	return out, rows.Err()
}

func (p *Postgres) DeleteOldEvents(ctx context.Context, endpointID string, olderThan time.Time) (int64, error) {
	ct, err := p.pool.Exec(ctx,
		`DELETE FROM events WHERE endpoint_id=$1 AND received_at_ms < $2`,
		endpointID, olderThan.UnixMilli())
	if err != nil {
		return 0, fmt.Errorf("store: delete old events: %w", err)
	}
	return ct.RowsAffected(), nil
}

func (p *Postgres) ListRetentionTargets(ctx context.Context) ([]RetentionTarget, error) {
	rows, err := p.pool.Query(ctx,
		`SELECT e.id, e.retention_days, COALESCE(u.plan, 'free'), COALESCE(u.sub_current_period_end_ms, 0)
		   FROM endpoints e JOIN users u ON u.id = e.owner_id`)
	if err != nil {
		return nil, fmt.Errorf("store: list retention targets: %w", err)
	}
	defer rows.Close()
	var out []RetentionTarget
	for rows.Next() {
		var t RetentionTarget
		if err := rows.Scan(&t.EndpointID, &t.RetentionDays, &t.OwnerPlan, &t.OwnerPeriodEndMS); err != nil {
			return nil, fmt.Errorf("store: scan retention target: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (p *Postgres) CreateShare(ctx context.Context, eventID string) (string, error) {
	token := NewToken(16)
	ct, err := p.pool.Exec(ctx,
		`UPDATE events SET share_token = COALESCE(share_token, $2) WHERE id=$1`, eventID, token)
	if err != nil {
		return "", fmt.Errorf("store: create share: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return "", ErrNotFound
	}
	// If a share token already existed, return the existing one.
	var existing string
	if err := p.pool.QueryRow(ctx, `SELECT share_token FROM events WHERE id=$1`, eventID).Scan(&existing); err != nil {
		return "", fmt.Errorf("store: read share token: %w", err)
	}
	return existing, nil
}

func (p *Postgres) GetEventByShareToken(ctx context.Context, token string) (*Event, error) {
	return p.scanEventWhere(ctx, "share_token=$1", token)
}

func (p *Postgres) CreateReplayAttempt(ctx context.Context, a *ReplayAttempt) error {
	hdrs, err := json.Marshal(nonNilMap(a.ResponseHeaders))
	if err != nil {
		return fmt.Errorf("store: marshal replay headers: %w", err)
	}
	err = p.pool.QueryRow(ctx, `
		INSERT INTO replay_attempts (event_id, target_url, resigned, response_status, response_headers, response_body, latency_ms, error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, created_at`,
		a.EventID, a.TargetURL, a.Resigned, a.ResponseStatus, hdrs, a.ResponseBody, a.LatencyMS, a.Error,
	).Scan(&a.ID, &a.CreatedAt)
	if err != nil {
		return fmt.Errorf("store: create replay attempt: %w", err)
	}
	return nil
}

func (p *Postgres) ListReplayAttempts(ctx context.Context, eventID string) ([]*ReplayAttempt, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id, event_id, target_url, resigned, response_status, response_headers, response_body, latency_ms, error, created_at
		FROM replay_attempts WHERE event_id=$1 ORDER BY created_at DESC`, eventID)
	if err != nil {
		return nil, fmt.Errorf("store: list replay attempts: %w", err)
	}
	defer rows.Close()
	var out []*ReplayAttempt
	for rows.Next() {
		var (
			a    ReplayAttempt
			hdrs []byte
		)
		if err := rows.Scan(&a.ID, &a.EventID, &a.TargetURL, &a.Resigned, &a.ResponseStatus, &hdrs,
			&a.ResponseBody, &a.LatencyMS, &a.Error, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("store: scan replay attempt: %w", err)
		}
		if err := json.Unmarshal(hdrs, &a.ResponseHeaders); err != nil {
			return nil, fmt.Errorf("store: unmarshal replay headers: %w", err)
		}
		out = append(out, &a)
	}
	return out, rows.Err()
}

func (p *Postgres) CreateAPIKey(ctx context.Context, k *APIKey) error {
	if k.ID == "" {
		k.ID = NewToken(16)
	}
	if k.CreatedAtMS == 0 {
		k.CreatedAtMS = time.Now().UnixMilli()
	}
	_, err := p.pool.Exec(ctx, `
		INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at_ms, last_used_at_ms)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		k.ID, k.UserID, k.Name, k.KeyHash, k.Prefix, k.CreatedAtMS, k.LastUsedAtMS)
	if err != nil {
		return fmt.Errorf("store: create api key: %w", err)
	}
	return nil
}

func (p *Postgres) ListAPIKeys(ctx context.Context, userID int64) ([]*APIKey, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id, user_id, name, key_hash, prefix, created_at_ms, last_used_at_ms
		FROM api_keys WHERE user_id=$1 ORDER BY created_at_ms DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("store: list api keys: %w", err)
	}
	defer rows.Close()
	var out []*APIKey
	for rows.Next() {
		k, serr := scanAPIKey(rows)
		if serr != nil {
			return nil, serr
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

func (p *Postgres) DeleteAPIKey(ctx context.Context, id string, userID int64) error {
	ct, err := p.pool.Exec(ctx, `DELETE FROM api_keys WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return fmt.Errorf("store: delete api key: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (p *Postgres) LookupAPIKeyByHash(ctx context.Context, keyHash string) (*APIKey, error) {
	if keyHash == "" {
		return nil, ErrNotFound
	}
	row := p.pool.QueryRow(ctx, `
		SELECT id, user_id, name, key_hash, prefix, created_at_ms, last_used_at_ms
		FROM api_keys WHERE key_hash=$1`, keyHash)
	k, err := scanAPIKey(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: lookup api key: %w", err)
	}
	return k, nil
}

func (p *Postgres) TouchAPIKey(ctx context.Context, id string, atMS int64) error {
	ct, err := p.pool.Exec(ctx, `UPDATE api_keys SET last_used_at_ms=$2 WHERE id=$1`, id, atMS)
	if err != nil {
		return fmt.Errorf("store: touch api key: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// scanAPIKey scans one api_keys row from a pgx Row or Rows.
func scanAPIKey(s interface{ Scan(...any) error }) (*APIKey, error) {
	var (
		k  APIKey
		lu *int64
	)
	if err := s.Scan(&k.ID, &k.UserID, &k.Name, &k.KeyHash, &k.Prefix, &k.CreatedAtMS, &lu); err != nil {
		return nil, err
	}
	k.LastUsedAtMS = lu
	return &k, nil
}

func (p *Postgres) InsertActivity(ctx context.Context, a *Activity) error {
	if a.CreatedAtMS == 0 {
		a.CreatedAtMS = time.Now().UnixMilli()
	}
	meta, err := json.Marshal(nonNilMap(a.Metadata))
	if err != nil {
		return fmt.Errorf("store: marshal activity metadata: %w", err)
	}
	err = p.pool.QueryRow(ctx, `
		INSERT INTO activity (user_id, action, target, metadata, created_at_ms)
		VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		a.UserID, a.Action, a.Target, meta, a.CreatedAtMS,
	).Scan(&a.ID)
	if err != nil {
		return fmt.Errorf("store: insert activity: %w", err)
	}
	return nil
}

func (p *Postgres) ListActivity(ctx context.Context, userID int64, limit int) ([]*Activity, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := p.pool.Query(ctx, `
		SELECT id, user_id, action, target, metadata, created_at_ms
		FROM activity WHERE user_id=$1 ORDER BY created_at_ms DESC, id DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("store: list activity: %w", err)
	}
	defer rows.Close()
	var out []*Activity
	for rows.Next() {
		var (
			a    Activity
			meta []byte
		)
		if err := rows.Scan(&a.ID, &a.UserID, &a.Action, &a.Target, &meta, &a.CreatedAtMS); err != nil {
			return nil, fmt.Errorf("store: scan activity: %w", err)
		}
		if err := json.Unmarshal(meta, &a.Metadata); err != nil {
			return nil, fmt.Errorf("store: unmarshal activity metadata: %w", err)
		}
		out = append(out, &a)
	}
	return out, rows.Err()
}

func nonNilMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}
