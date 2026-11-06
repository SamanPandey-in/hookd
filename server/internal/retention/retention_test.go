package retention

import (
	"context"
	"testing"
	"time"

	"whook/internal/plan"
	"whook/internal/store"
)

var day = 24 * time.Hour

// periodEndMS converts a period end to unix ms; the zero time means never subscribed.
func periodEndMS(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixMilli()
}

// seed creates a user on the given plan, one endpoint with the given retention,
// and one event per age. It returns the endpoint id and the event ids by age.
func seed(t *testing.T, st *store.Fake, now time.Time, ghID int64, userPlan string, periodEnd time.Time, retention int, ages ...time.Duration) (string, map[time.Duration]string) {
	t.Helper()
	ctx := context.Background()
	u, err := st.UpsertUserByGitHub(ctx, ghID, "u", "u@x.com")
	if err != nil {
		t.Fatal(err)
	}
	if err := st.UpdateUserSubscription(ctx, u.ID, userPlan, store.Subscription{CurrentPeriodEnd: periodEndMS(periodEnd)}); err != nil {
		t.Fatal(err)
	}
	ep := &store.Endpoint{OwnerID: u.ID, Name: "e", RetentionDays: retention}
	if err := st.CreateEndpoint(ctx, ep); err != nil {
		t.Fatal(err)
	}
	ids := map[time.Duration]string{}
	for _, age := range ages {
		ev := &store.Event{
			EndpointID:   ep.ID,
			Method:       "POST",
			RawBody:      []byte("{}"),
			ReceivedAtMS: now.Add(-age).UnixMilli(),
		}
		if err := st.CreateEvent(ctx, ev); err != nil {
			t.Fatal(err)
		}
		ids[age] = ev.ID
	}
	return ep.ID, ids
}

func exists(t *testing.T, st *store.Fake, id string) bool {
	t.Helper()
	_, err := st.GetEvent(context.Background(), id)
	if err == nil {
		return true
	}
	if err == store.ErrNotFound {
		return false
	}
	t.Fatal(err)
	return false
}

func TestCutoffClampsToPlan(t *testing.T) {
	now := time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name      string
		plan      string
		periodEnd int64
		requested int
		wantDays  int
	}{
		{"free within cap", plan.Free, 0, 3, 3},
		{"free over cap", plan.Free, 0, 90, plan.FreeRetentionDays},
		{"pro within cap", plan.Pro, 0, 30, 30},
		{"pro over cap", plan.Pro, 0, 365, plan.ProRetentionDays},
		{"unset uses plan cap", plan.Free, 0, 0, plan.FreeRetentionDays},
		{"unknown plan is free", "weird", 0, 90, plan.FreeRetentionDays},
		{"free, period ended 1 day ago, in grace", plan.Free, now.Add(-1 * day).UnixMilli(), 90, plan.ProRetentionDays},
		{"free, period ended 4 days ago, in grace", plan.Free, now.Add(-4 * day).UnixMilli(), 90, plan.ProRetentionDays},
		{"free, period ended 6 days ago, grace over", plan.Free, now.Add(-6 * day).UnixMilli(), 90, plan.FreeRetentionDays},
		{"free, period ends in future (cancelled early), in grace", plan.Free, now.Add(3 * day).UnixMilli(), 90, plan.ProRetentionDays},
		{"never subscribed gets no grace", plan.Free, 0, 90, plan.FreeRetentionDays},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := Cutoff(now, c.plan, c.periodEnd, c.requested)
			want := now.Add(-time.Duration(c.wantDays) * day)
			if !got.Equal(want) {
				t.Fatalf("cutoff = %v, want %v", got, want)
			}
		})
	}
}

func TestRunOncePurgesPerEndpointRetention(t *testing.T) {
	now := time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)
	st := store.NewFake()

	// Free user, 7 days: 1d old stays, 8d old goes.
	_, free := seed(t, st, now, 1, plan.Free, time.Time{}, 7, 1*day, 8*day)
	// Pro user, custom 30 days: 20d stays, 40d goes.
	_, pro30 := seed(t, st, now, 2, plan.Pro, now.Add(10*day), 30, 20*day, 40*day)
	// Pro user asking for 365 is capped at 90: 80d stays, 100d goes.
	_, pro365 := seed(t, st, now, 3, plan.Pro, now.Add(10*day), 365, 80*day, 100*day)
	// Downgraded long ago (grace over): endpoint still says 90 but the owner is
	// free, so the free cap of 7 days applies: 6d stays, 10d goes.
	_, down := seed(t, st, now, 4, plan.Free, now.Add(-30*day), 90, 6*day, 10*day)

	p := &Purger{Store: st, Now: func() time.Time { return now }, Logf: t.Logf}
	n, err := p.RunOnce(context.Background())
	if err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if n != 4 {
		t.Fatalf("deleted %d events, want 4", n)
	}

	keep := []string{free[1*day], pro30[20*day], pro365[80*day], down[6*day]}
	gone := []string{free[8*day], pro30[40*day], pro365[100*day], down[10*day]}
	for _, id := range keep {
		if !exists(t, st, id) {
			t.Errorf("event %s was deleted but is within retention", id)
		}
	}
	for _, id := range gone {
		if exists(t, st, id) {
			t.Errorf("event %s survived but is past retention", id)
		}
	}

	// Idempotent: a second pass deletes nothing.
	n, err = p.RunOnce(context.Background())
	if err != nil || n != 0 {
		t.Fatalf("second RunOnce = (%d, %v), want (0, nil)", n, err)
	}
}

func TestRunOnceGivesDowngradedUsersGrace(t *testing.T) {
	now := time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)
	st := store.NewFake()

	// Cancelled 3 days ago, endpoint set to 90 days. Inside the 5 day grace the
	// Pro cap still applies: 60d history stays, 100d goes.
	_, inGrace := seed(t, st, now, 1, plan.Free, now.Add(-3*day), 90, 60*day, 100*day)
	// Cancelled 6 days ago. Grace is over, free cap applies: 6d stays, 10d and
	// 60d go.
	_, pastGrace := seed(t, st, now, 2, plan.Free, now.Add(-6*day), 90, 6*day, 10*day, 60*day)

	p := &Purger{Store: st, Now: func() time.Time { return now }, Logf: t.Logf}
	n, err := p.RunOnce(context.Background())
	if err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if n != 3 {
		t.Fatalf("deleted %d events, want 3", n)
	}
	for _, id := range []string{inGrace[60*day], pastGrace[6*day]} {
		if !exists(t, st, id) {
			t.Errorf("event %s should have been kept", id)
		}
	}
	for _, id := range []string{inGrace[100*day], pastGrace[10*day], pastGrace[60*day]} {
		if exists(t, st, id) {
			t.Errorf("event %s should have been purged", id)
		}
	}

	// Same endpoint, 2 days later: the first user's grace has now ended too.
	p.Now = func() time.Time { return now.Add(3 * day) }
	if _, err := p.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce later: %v", err)
	}
	if exists(t, st, inGrace[60*day]) {
		t.Error("60d event should be purged once grace has ended")
	}
}

func TestRunOnceOnEmptyStore(t *testing.T) {
	p := &Purger{Store: store.NewFake(), Logf: t.Logf}
	n, err := p.RunOnce(context.Background())
	if err != nil || n != 0 {
		t.Fatalf("RunOnce on empty store = (%d, %v), want (0, nil)", n, err)
	}
}

func TestRunPurgesImmediatelyThenStopsOnCancel(t *testing.T) {
	now := time.Now()
	st := store.NewFake()
	_, ids := seed(t, st, now, 1, plan.Free, time.Time{}, 7, 30*day)

	p := &Purger{Store: st, Now: func() time.Time { return now }, Logf: t.Logf}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		p.Run(ctx, time.Hour) // long interval: only the immediate pass can delete
		close(done)
	}()

	deadline := time.Now().Add(2 * time.Second)
	for exists(t, st, ids[30*day]) {
		if time.Now().After(deadline) {
			t.Fatal("expired event was not purged on startup")
		}
		time.Sleep(5 * time.Millisecond)
	}

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after context cancel")
	}
}

func TestRunDisabledReturnsImmediately(t *testing.T) {
	now := time.Now()
	st := store.NewFake()
	_, ids := seed(t, st, now, 1, plan.Free, time.Time{}, 7, 30*day)

	p := &Purger{Store: st, Now: func() time.Time { return now }, Logf: t.Logf}
	done := make(chan struct{})
	go func() {
		p.Run(context.Background(), 0)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Run(0) should return immediately")
	}
	if !exists(t, st, ids[30*day]) {
		t.Fatal("disabled purger must not delete anything")
	}
}
