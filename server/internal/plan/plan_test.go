package plan

import "testing"

func TestIsPro(t *testing.T) {
	if !IsPro(Pro) {
		t.Error("IsPro(Pro) must be true")
	}
	for _, p := range []string{Free, "", "PRO", "enterprise", "pro "} {
		if IsPro(p) {
			t.Errorf("IsPro(%q) must be false", p)
		}
	}
}

func TestNormalize(t *testing.T) {
	cases := map[string]string{
		Pro:          Pro,
		Free:         Free,
		"":           Free,
		"enterprise": Free,
		"PRO":        Free, // case-sensitive: only exact "pro" is Pro
	}
	for in, want := range cases {
		if got := Normalize(in); got != want {
			t.Errorf("Normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMaxEndpoints(t *testing.T) {
	if got := MaxEndpoints(Pro); got != ProMaxEndpoints {
		t.Errorf("MaxEndpoints(Pro) = %d, want %d", got, ProMaxEndpoints)
	}
	if got := MaxEndpoints(Free); got != FreeMaxEndpoints {
		t.Errorf("MaxEndpoints(Free) = %d, want %d", got, FreeMaxEndpoints)
	}
	// Unknown plans are treated as free (never accidentally grant the Pro cap).
	if got := MaxEndpoints("mystery"); got != FreeMaxEndpoints {
		t.Errorf("MaxEndpoints(unknown) = %d, want free cap %d", got, FreeMaxEndpoints)
	}
}

func TestMaxRetentionDays(t *testing.T) {
	if got := MaxRetentionDays(Pro); got != ProRetentionDays {
		t.Errorf("MaxRetentionDays(Pro) = %d, want %d", got, ProRetentionDays)
	}
	if got := MaxRetentionDays(Free); got != FreeRetentionDays {
		t.Errorf("MaxRetentionDays(Free) = %d, want %d", got, FreeRetentionDays)
	}
	if got := MaxRetentionDays("mystery"); got != FreeRetentionDays {
		t.Errorf("MaxRetentionDays(unknown) = %d, want free cap %d", got, FreeRetentionDays)
	}
}

func TestClampRetentionDays(t *testing.T) {
	cases := []struct {
		plan      string
		requested int
		want      int
	}{
		// Free: capped at 7, 0/negative => default cap.
		{Free, 0, FreeRetentionDays},
		{Free, -5, FreeRetentionDays},
		{Free, 1, 1},
		{Free, 7, 7},
		{Free, 8, FreeRetentionDays},
		{Free, 90, FreeRetentionDays},
		// Pro: capped at 90.
		{Pro, 0, ProRetentionDays},
		{Pro, 1, 1},
		{Pro, 30, 30},
		{Pro, 90, 90},
		{Pro, 365, ProRetentionDays},
		// Unknown plan behaves as free.
		{"mystery", 90, FreeRetentionDays},
	}
	for _, c := range cases {
		if got := ClampRetentionDays(c.plan, c.requested); got != c.want {
			t.Errorf("ClampRetentionDays(%q, %d) = %d, want %d", c.plan, c.requested, got, c.want)
		}
	}
}

func TestFeatureGatesAreProOnly(t *testing.T) {
	gates := map[string]func(string) bool{
		"CanSeeVerifyWhy": CanSeeVerifyWhy,
		"CanReplay":       CanReplay,
		"CanEditResponse": CanEditResponse,
		"CanShare":        CanShare,
		"CanTextSearch":   CanTextSearch,
	}
	for name, gate := range gates {
		if !gate(Pro) {
			t.Errorf("%s(Pro) must be true", name)
		}
		for _, p := range []string{Free, "", "mystery"} {
			if gate(p) {
				t.Errorf("%s(%q) must be false — Pro-only feature leaked", name, p)
			}
		}
	}
}

// Guards the gating matrix itself: Pro must never be stingier than Free, and the
// grace window must be positive (a zero would delete a downgraded user's history
// the instant they cancel).
func TestLimitsInvariants(t *testing.T) {
	if ProMaxEndpoints <= FreeMaxEndpoints {
		t.Errorf("ProMaxEndpoints (%d) must exceed FreeMaxEndpoints (%d)", ProMaxEndpoints, FreeMaxEndpoints)
	}
	if ProRetentionDays <= FreeRetentionDays {
		t.Errorf("ProRetentionDays (%d) must exceed FreeRetentionDays (%d)", ProRetentionDays, FreeRetentionDays)
	}
	if DowngradeGraceDays <= 0 {
		t.Errorf("DowngradeGraceDays (%d) must be positive", DowngradeGraceDays)
	}
}
