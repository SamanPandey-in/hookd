// Package plan holds the plan-gating matrix: which limits and features belong to
// the free vs Pro tiers. It is the single source of truth the API enforces
// server-side (the client is never trusted). Limits are constants here so they
// are easy to tune in one place.
package plan

// Plan identifiers. Stored on users.plan.
const (
	Free = "free"
	Pro  = "pro"
)

// Limits (the gating matrix). See docs/PRODUCT.md §6.
const (
	FreeMaxEndpoints  = 2
	ProMaxEndpoints   = 25
	FreeRetentionDays = 7
	ProRetentionDays  = 90
)

// IsPro reports whether a plan string grants Pro features.
func IsPro(p string) bool { return p == Pro }

// Normalize coerces an empty/unknown plan to Free.
func Normalize(p string) string {
	if p == Pro {
		return Pro
	}
	return Free
}

// MaxEndpoints is the endpoint-count cap for a plan.
func MaxEndpoints(p string) int {
	if IsPro(p) {
		return ProMaxEndpoints
	}
	return FreeMaxEndpoints
}

// MaxRetentionDays is the event-retention cap (in days) for a plan.
func MaxRetentionDays(p string) int {
	if IsPro(p) {
		return ProRetentionDays
	}
	return FreeRetentionDays
}

// ClampRetentionDays clamps a requested retention to [1, plan max]. A request of
// 0 (unset) returns the plan's default cap.
func ClampRetentionDays(p string, requested int) int {
	max := MaxRetentionDays(p)
	if requested <= 0 {
		return max
	}
	if requested > max {
		return max
	}
	return requested
}

// Feature gates (Pro-only). Each returns true when the plan may use it.
// The "why" of signature verification (cause/summary/details) is the paid wedge:
// free users see pass/fail/unknown status only.
func CanSeeVerifyWhy(p string) bool { return IsPro(p) }
func CanReplay(p string) bool       { return IsPro(p) }
func CanEditResponse(p string) bool { return IsPro(p) }
func CanShare(p string) bool        { return IsPro(p) }
func CanTextSearch(p string) bool   { return IsPro(p) }
