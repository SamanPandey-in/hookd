// Package retention deletes captured events once they outlive their endpoint's
// retention window. The window is the endpoint's retention_days, capped by the
// owner's current plan (free 7 days, Pro 90). A downgraded account keeps its
// Pro cap for plan.DowngradeGraceDays after its last paid period ends, then
// falls to the free cap.
//
// Privacy: this package only ever logs counts, never event bodies or headers.
package retention

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"whook/internal/plan"
	"whook/internal/store"
)

// Purger deletes expired events from a Store.
type Purger struct {
	Store store.Store
	// Now is injectable for tests; defaults to time.Now.
	Now func() time.Time
	// Logf is injectable for tests; defaults to log.Printf.
	Logf func(format string, args ...any)
}

// New returns a Purger with production defaults.
func New(st store.Store) *Purger {
	return &Purger{Store: st, Now: time.Now, Logf: log.Printf}
}

func (p *Purger) now() time.Time {
	if p.Now != nil {
		return p.Now()
	}
	return time.Now()
}

func (p *Purger) logf(format string, args ...any) {
	if p.Logf != nil {
		p.Logf(format, args...)
	}
}

// effectivePlan is the plan whose retention cap applies right now. A free owner
// who was subscribed recently keeps Pro limits until plan.DowngradeGraceDays
// after their last known period end, so a cancellation does not wipe their
// history the same day. Owners who never subscribed (periodEndMS == 0) get no
// grace.
func effectivePlan(now time.Time, ownerPlan string, periodEndMS int64) string {
	p := plan.Normalize(ownerPlan)
	if p == plan.Free && periodEndMS > 0 {
		graceEnd := time.UnixMilli(periodEndMS).Add(time.Duration(plan.DowngradeGraceDays) * 24 * time.Hour)
		if now.Before(graceEnd) {
			return plan.Pro
		}
	}
	return p
}

// Cutoff returns the oldest timestamp an event may have and still be kept, for
// an endpoint with the given requested retention. ownerPlan and periodEndMS
// describe the endpoint's owner (see effectivePlan for the grace rule).
func Cutoff(now time.Time, ownerPlan string, periodEndMS int64, requestedDays int) time.Time {
	days := plan.ClampRetentionDays(effectivePlan(now, ownerPlan, periodEndMS), requestedDays)
	return now.Add(-time.Duration(days) * 24 * time.Hour)
}

// RunOnce purges every endpoint once and returns the total events deleted. A
// failure on one endpoint does not stop the rest; the first error is returned
// alongside the count so callers can log it.
func (p *Purger) RunOnce(ctx context.Context) (int64, error) {
	targets, err := p.Store.ListRetentionTargets(ctx)
	if err != nil {
		return 0, fmt.Errorf("retention: list targets: %w", err)
	}
	now := p.now()
	var total int64
	var firstErr error
	for _, t := range targets {
		if err := ctx.Err(); err != nil {
			return total, err
		}
		n, derr := p.Store.DeleteOldEvents(ctx, t.EndpointID, Cutoff(now, t.OwnerPlan, t.OwnerPeriodEndMS, t.RetentionDays))
		total += n
		if derr != nil && firstErr == nil {
			firstErr = fmt.Errorf("retention: purge endpoint %s: %w", t.EndpointID, derr)
		}
	}
	return total, firstErr
}

// Run purges immediately, then every interval, until ctx is cancelled. An
// interval <= 0 disables purging and returns at once.
func (p *Purger) Run(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		p.logf("whook: retention purger disabled (PURGE_INTERVAL_MINUTES=0), events are kept forever")
		return
	}
	p.logf("whook: retention purger running every %s", interval)
	p.tick(ctx)
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			p.tick(ctx)
		}
	}
}

func (p *Purger) tick(ctx context.Context) {
	n, err := p.RunOnce(ctx)
	if err != nil && !errors.Is(err, context.Canceled) {
		p.logf("whook: retention purge error: %v", err)
	}
	if n > 0 {
		p.logf("whook: retention purge deleted %d expired events", n)
	}
}
