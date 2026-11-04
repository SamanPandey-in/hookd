package httpx

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiter is a keyed token-bucket limiter (per endpoint id or per IP). Idle
// keys are garbage-collected so a flood of distinct IPs can't grow memory
// unbounded.
type RateLimiter struct {
	mu        sync.Mutex
	buckets   map[string]*bucket
	r         rate.Limit
	burst     int
	lastSweep time.Time
}

type bucket struct {
	lim  *rate.Limiter
	seen time.Time
}

// NewRateLimiter builds a limiter allowing ratePerMin sustained requests with
// the given burst.
func NewRateLimiter(ratePerMin, burst int) *RateLimiter {
	if burst <= 0 {
		burst = 1
	}
	return &RateLimiter{
		buckets:   map[string]*bucket{},
		r:         rate.Limit(float64(ratePerMin) / 60.0),
		burst:     burst,
		lastSweep: time.Now(),
	}
}

// Allow reports whether a request keyed by key may proceed now.
func (l *RateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if now.Sub(l.lastSweep) > 10*time.Minute {
		for k, b := range l.buckets {
			if now.Sub(b.seen) > 10*time.Minute {
				delete(l.buckets, k)
			}
		}
		l.lastSweep = now
	}
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{lim: rate.NewLimiter(l.r, l.burst)}
		l.buckets[key] = b
	}
	b.seen = now
	return b.lim.Allow()
}
