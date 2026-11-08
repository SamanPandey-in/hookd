package store

import (
	"context"
	"crypto/subtle"
	"sort"
	"strings"
	"sync"
	"time"
)

// Fake is an in-memory Store for unit tests. It is safe for concurrent use.
type Fake struct {
	mu           sync.Mutex
	nextUserID   int64
	nextAttempt  int64
	nextActivity int64
	users        map[int64]*User
	ghIndex      map[int64]int64 // githubID -> userID
	endpoints    map[string]*Endpoint
	secrets      map[string][]byte
	events       map[string]*Event
	shareIndex   map[string]string // token -> eventID
	attempts     map[string][]*ReplayAttempt
	processedWH  map[string]bool       // Standard-Webhooks id -> handled
	apiKeys      map[string]*APIKey    // id -> key
	activity     map[int64][]*Activity // userID -> entries (append order)
}

// NewFake returns an empty in-memory store.
func NewFake() *Fake {
	return &Fake{
		users:       map[int64]*User{},
		ghIndex:     map[int64]int64{},
		endpoints:   map[string]*Endpoint{},
		secrets:     map[string][]byte{},
		events:      map[string]*Event{},
		shareIndex:  map[string]string{},
		attempts:    map[string][]*ReplayAttempt{},
		processedWH: map[string]bool{},
		apiKeys:     map[string]*APIKey{},
		activity:    map[int64][]*Activity{},
	}
}

func (f *Fake) Close() {}

func (f *Fake) UpsertUserByGitHub(_ context.Context, githubID int64, login, email string) (*User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if id, ok := f.ghIndex[githubID]; ok {
		u := f.users[id]
		u.Login, u.Email = login, email
		return cloneUser(u), nil
	}
	f.nextUserID++
	// NotifyProduct defaults TRUE to mirror the Postgres column default (0008).
	u := &User{ID: f.nextUserID, GitHubID: githubID, Login: login, Email: email, CreatedAt: time.Now(), Plan: "free", NotifyProduct: true}
	f.users[u.ID] = u
	f.ghIndex[githubID] = u.ID
	return cloneUser(u), nil
}

func (f *Fake) GetUser(_ context.Context, id int64) (*User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[id]
	if !ok {
		return nil, ErrNotFound
	}
	return cloneUser(u), nil
}

func (f *Fake) UpdateUserProfile(_ context.Context, userID int64, avatarURL, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[userID]
	if !ok {
		return ErrNotFound
	}
	u.AvatarURL = avatarURL
	u.Name = name
	return nil
}

func (f *Fake) UpdateUserTheme(_ context.Context, userID int64, theme string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[userID]
	if !ok {
		return ErrNotFound
	}
	u.Theme = theme
	return nil
}

func (f *Fake) UpdateNotificationPrefs(_ context.Context, userID int64, prefs NotificationPrefs) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[userID]
	if !ok {
		return ErrNotFound
	}
	u.BillingEmail = prefs.BillingEmail
	u.NotifyProduct = prefs.NotifyProduct
	u.NotifyCaptureAlerts = prefs.NotifyCaptureAlerts
	return nil
}

func (f *Fake) DeleteAccount(_ context.Context, userID int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[userID]
	if !ok {
		return ErrNotFound
	}
	// Cascade: endpoints -> their events -> their replay attempts.
	for id, e := range f.endpoints {
		if e.OwnerID != userID {
			continue
		}
		for evID, ev := range f.events {
			if ev.EndpointID == id {
				delete(f.attempts, evID)
				for tok, eid := range f.shareIndex {
					if eid == evID {
						delete(f.shareIndex, tok)
					}
				}
				delete(f.events, evID)
			}
		}
		delete(f.secrets, id)
		delete(f.endpoints, id)
	}
	// API keys + activity owned by the user.
	for id, k := range f.apiKeys {
		if k.UserID == userID {
			delete(f.apiKeys, id)
		}
	}
	delete(f.activity, userID)
	delete(f.ghIndex, u.GitHubID)
	delete(f.users, userID)
	return nil
}

func (f *Fake) GetUserByDodoCustomerID(_ context.Context, customerID string) (*User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if customerID == "" {
		return nil, ErrNotFound
	}
	for _, u := range f.users {
		if u.DodoCustomerID == customerID {
			return cloneUser(u), nil
		}
	}
	return nil, ErrNotFound
}

func (f *Fake) SetUserDodoCustomer(_ context.Context, userID int64, customerID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[userID]
	if !ok {
		return ErrNotFound
	}
	u.DodoCustomerID = customerID
	return nil
}

func (f *Fake) UpdateUserSubscription(_ context.Context, userID int64, plan string, sub Subscription) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.users[userID]
	if !ok {
		return ErrNotFound
	}
	u.Plan = plan
	u.Subscription = sub
	return nil
}

func (f *Fake) MarkWebhookProcessed(_ context.Context, webhookID string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.processedWH[webhookID] {
		return false, nil
	}
	f.processedWH[webhookID] = true
	return true, nil
}

func (f *Fake) CreateEndpoint(_ context.Context, e *Endpoint) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if e.ID == "" {
		e.ID = NewToken(16)
	}
	if e.Response.Status == 0 {
		e.Response = DefaultResponseRule()
	}
	if e.RetentionDays == 0 {
		e.RetentionDays = 7
	}
	e.CreatedAt = time.Now()
	f.endpoints[e.ID] = cloneEndpoint(e)
	return nil
}

func (f *Fake) GetEndpoint(_ context.Context, id string) (*Endpoint, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	e, ok := f.endpoints[id]
	if !ok {
		return nil, ErrNotFound
	}
	out := cloneEndpoint(e)
	out.HasSecret = len(f.secrets[id]) > 0
	return out, nil
}

func (f *Fake) ListEndpoints(_ context.Context, ownerID int64) ([]*Endpoint, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []*Endpoint
	for _, e := range f.endpoints {
		if e.OwnerID == ownerID {
			c := cloneEndpoint(e)
			c.HasSecret = len(f.secrets[e.ID]) > 0
			out = append(out, c)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

func (f *Fake) UpdateEndpoint(_ context.Context, e *Endpoint) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	cur, ok := f.endpoints[e.ID]
	if !ok {
		return ErrNotFound
	}
	cur.Name = e.Name
	cur.Provider = e.Provider
	cur.Response = e.Response
	cur.RetentionDays = e.RetentionDays
	return nil
}

func (f *Fake) DeleteEndpoint(_ context.Context, id string, ownerID int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	e, ok := f.endpoints[id]
	if !ok || e.OwnerID != ownerID {
		return ErrNotFound
	}
	delete(f.endpoints, id)
	delete(f.secrets, id)
	return nil
}

func (f *Fake) SetEndpointSecret(_ context.Context, id string, enc []byte, mask string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	e, ok := f.endpoints[id]
	if !ok {
		return ErrNotFound
	}
	if enc == nil {
		delete(f.secrets, id)
		e.SecretMask = ""
		return nil
	}
	f.secrets[id] = append([]byte(nil), enc...)
	e.SecretMask = mask
	return nil
}

func (f *Fake) GetEndpointSecret(_ context.Context, id string) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.endpoints[id]; !ok {
		return nil, ErrNotFound
	}
	enc := f.secrets[id]
	if enc == nil {
		return nil, nil
	}
	return append([]byte(nil), enc...), nil
}

func (f *Fake) CreateEvent(_ context.Context, ev *Event) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if ev.ID == "" {
		ev.ID = NewToken(16)
	}
	f.events[ev.ID] = cloneEvent(ev)
	return nil
}

func (f *Fake) GetEvent(_ context.Context, id string) (*Event, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	ev, ok := f.events[id]
	if !ok {
		return nil, ErrNotFound
	}
	return cloneEvent(ev), nil
}

func (f *Fake) ListEvents(_ context.Context, endpointID string, filter EventFilter) ([]*Event, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []*Event
	for _, ev := range f.events {
		if ev.EndpointID != endpointID {
			continue
		}
		if filter.Method != "" && !strings.EqualFold(ev.Method, filter.Method) {
			continue
		}
		if filter.VerifyStatus != "" && ev.VerifyStatus != filter.VerifyStatus {
			continue
		}
		if filter.Text != "" && !strings.Contains(strings.ToLower(string(ev.RawBody)), strings.ToLower(filter.Text)) {
			continue
		}
		if filter.BeforeMS > 0 && ev.ReceivedAtMS >= filter.BeforeMS {
			continue
		}
		out = append(out, cloneEvent(ev))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ReceivedAtMS > out[j].ReceivedAtMS })
	limit := filter.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *Fake) DeleteOldEvents(_ context.Context, endpointID string, olderThan time.Time) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	cutoff := olderThan.UnixMilli()
	var n int64
	for id, ev := range f.events {
		if ev.EndpointID == endpointID && ev.ReceivedAtMS < cutoff {
			delete(f.events, id)
			n++
		}
	}
	return n, nil
}

func (f *Fake) ListRetentionTargets(_ context.Context) ([]RetentionTarget, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]RetentionTarget, 0, len(f.endpoints))
	for _, e := range f.endpoints {
		p := "free"
		var periodEnd int64
		if u, ok := f.users[e.OwnerID]; ok {
			if u.Plan != "" {
				p = u.Plan
			}
			periodEnd = u.Subscription.CurrentPeriodEnd
		}
		out = append(out, RetentionTarget{EndpointID: e.ID, RetentionDays: e.RetentionDays, OwnerPlan: p, OwnerPeriodEndMS: periodEnd})
	}
	return out, nil
}

func (f *Fake) CreateShare(_ context.Context, eventID string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.events[eventID]; !ok {
		return "", ErrNotFound
	}
	for tok, eid := range f.shareIndex {
		if eid == eventID {
			return tok, nil
		}
	}
	token := NewToken(16)
	f.shareIndex[token] = eventID
	return token, nil
}

func (f *Fake) GetEventByShareToken(_ context.Context, token string) (*Event, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	eid, ok := f.shareIndex[token]
	if !ok {
		return nil, ErrNotFound
	}
	ev, ok := f.events[eid]
	if !ok {
		return nil, ErrNotFound
	}
	return cloneEvent(ev), nil
}

func (f *Fake) CreateReplayAttempt(_ context.Context, a *ReplayAttempt) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextAttempt++
	a.ID = f.nextAttempt
	a.CreatedAt = time.Now()
	f.attempts[a.EventID] = append(f.attempts[a.EventID], cloneAttempt(a))
	return nil
}

func (f *Fake) ListReplayAttempts(_ context.Context, eventID string) ([]*ReplayAttempt, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	src := f.attempts[eventID]
	out := make([]*ReplayAttempt, 0, len(src))
	for i := len(src) - 1; i >= 0; i-- {
		out = append(out, cloneAttempt(src[i]))
	}
	return out, nil
}

func (f *Fake) CreateAPIKey(_ context.Context, k *APIKey) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if k.ID == "" {
		k.ID = NewToken(16)
	}
	if k.CreatedAtMS == 0 {
		k.CreatedAtMS = time.Now().UnixMilli()
	}
	f.apiKeys[k.ID] = cloneAPIKey(k)
	return nil
}

func (f *Fake) ListAPIKeys(_ context.Context, userID int64) ([]*APIKey, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []*APIKey
	for _, k := range f.apiKeys {
		if k.UserID == userID {
			out = append(out, cloneAPIKey(k))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAtMS > out[j].CreatedAtMS })
	return out, nil
}

func (f *Fake) DeleteAPIKey(_ context.Context, id string, userID int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	k, ok := f.apiKeys[id]
	if !ok || k.UserID != userID {
		return ErrNotFound
	}
	delete(f.apiKeys, id)
	return nil
}

func (f *Fake) RotateAPIKey(_ context.Context, id string, userID int64, newHash, newPrefix string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	k, ok := f.apiKeys[id]
	if !ok || k.UserID != userID {
		return ErrNotFound
	}
	// New secret: swap hash/prefix, reset last-used. id/name/expiry are kept.
	k.KeyHash = newHash
	k.Prefix = newPrefix
	k.LastUsedAtMS = nil
	k.LastUsedIP = ""
	return nil
}

func (f *Fake) LookupAPIKeyByHash(_ context.Context, keyHash string) (*APIKey, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if keyHash == "" {
		return nil, ErrNotFound
	}
	for _, k := range f.apiKeys {
		// Constant-time compare so lookup time does not leak the stored hash.
		if subtle.ConstantTimeCompare([]byte(k.KeyHash), []byte(keyHash)) == 1 {
			return cloneAPIKey(k), nil
		}
	}
	return nil, ErrNotFound
}

func (f *Fake) TouchAPIKey(_ context.Context, id string, atMS int64, ip string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	k, ok := f.apiKeys[id]
	if !ok {
		return ErrNotFound
	}
	v := atMS
	k.LastUsedAtMS = &v
	if ip != "" {
		k.LastUsedIP = ip
	}
	return nil
}

func (f *Fake) InsertActivity(_ context.Context, a *Activity) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextActivity++
	a.ID = f.nextActivity
	if a.CreatedAtMS == 0 {
		a.CreatedAtMS = time.Now().UnixMilli()
	}
	f.activity[a.UserID] = append(f.activity[a.UserID], cloneActivity(a))
	return nil
}

func (f *Fake) ListActivity(_ context.Context, userID int64, limit int, beforeMS int64) ([]*Activity, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	src := f.activity[userID]
	out := make([]*Activity, 0, len(src))
	for i := len(src) - 1; i >= 0; i-- { // newest first
		if beforeMS > 0 && src[i].CreatedAtMS >= beforeMS {
			continue
		}
		out = append(out, cloneActivity(src[i]))
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// --- clone helpers (defensive copies so callers can't mutate stored state) ---

func cloneUser(u *User) *User { c := *u; return &c }

func cloneEndpoint(e *Endpoint) *Endpoint {
	c := *e
	c.Response.Headers = copyMap(e.Response.Headers)
	return &c
}

func cloneEvent(ev *Event) *Event {
	c := *ev
	c.Headers = append([]HeaderPair(nil), ev.Headers...)
	c.RawBody = append([]byte(nil), ev.RawBody...)
	c.VerifyDetails = copyMap(ev.VerifyDetails)
	return &c
}

func cloneAttempt(a *ReplayAttempt) *ReplayAttempt {
	c := *a
	c.ResponseHeaders = copyMap(a.ResponseHeaders)
	return &c
}

func cloneAPIKey(k *APIKey) *APIKey {
	c := *k
	if k.LastUsedAtMS != nil {
		v := *k.LastUsedAtMS
		c.LastUsedAtMS = &v
	}
	if k.ExpiresAtMS != nil {
		v := *k.ExpiresAtMS
		c.ExpiresAtMS = &v
	}
	if k.Scopes != nil {
		c.Scopes = append([]string(nil), k.Scopes...)
	}
	return &c
}

func cloneActivity(a *Activity) *Activity {
	c := *a
	c.Metadata = copyMap(a.Metadata)
	return &c
}

func copyMap(m map[string]string) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
