package api

import (
	"net/http"

	"whook/internal/httpx"
	"whook/internal/verify"
)

// PublicVerify is the public, no-auth signature debugger backing POST /debug/verify.
//
// It is deliberately store-free: the handler has NO persistence dependency, so it
// cannot (and must not) write anything. It performs ZERO outbound I/O — verify is
// pure — so it is not an SSRF or amplification vector. It never logs the secret or
// the body. It is rate-limited per client IP via its own dedicated bucket.
type PublicVerify struct {
	// RL is a dedicated per-IP token-bucket limiter (separate from the ingest
	// limiters). A nil limiter disables rate limiting (used only in unit tests
	// that don't exercise the limit).
	RL *httpx.RateLimiter

	// MaxBodyBytes caps the raw `body` string. MaxHeaderBytes caps the combined
	// size of all header names+values. MaxHeaders caps the header count. Zero
	// falls back to the defaults below.
	MaxBodyBytes   int
	MaxHeaderBytes int
	MaxHeaders     int
}

const (
	defaultDebugMaxBody    = 1 << 20 // 1 MiB raw body
	defaultDebugMaxHeaders = 64 << 10
	defaultDebugHeaderCnt  = 200
	// decodeSlack covers JSON escaping/structure overhead on top of the body cap.
	debugDecodeSlack = 128 << 10
)

// debugVerifyReq is the public request shape. `provider` is optional — when empty
// the provider is auto-detected from the headers.
type debugVerifyReq struct {
	Provider string            `json:"provider"`
	Secret   string            `json:"secret"`
	Headers  map[string]string `json:"headers"`
	Body     string            `json:"body"`
}

// debugVerifyResp is the full, explainable result returned to the caller. It is
// exactly the public verify.Result surface, flattened to stable JSON keys the
// frontend and CLI depend on.
type debugVerifyResp struct {
	Provider string            `json:"provider"`
	Status   string            `json:"status"`
	Cause    string            `json:"cause"`
	Summary  string            `json:"summary"`
	Details  map[string]string `json:"details"`
}

func (p *PublicVerify) maxBody() int {
	if p.MaxBodyBytes > 0 {
		return p.MaxBodyBytes
	}
	return defaultDebugMaxBody
}

func (p *PublicVerify) maxHeaderBytes() int {
	if p.MaxHeaderBytes > 0 {
		return p.MaxHeaderBytes
	}
	return defaultDebugMaxHeaders
}

func (p *PublicVerify) maxHeaders() int {
	if p.MaxHeaders > 0 {
		return p.MaxHeaders
	}
	return defaultDebugHeaderCnt
}

// Verify handles POST /debug/verify. It builds a verify.Input from the pasted
// secret/headers/body, runs the pure verifier, and returns the full Result. No
// storage, no outbound I/O, no secret/body logging.
func (p *PublicVerify) Verify(w http.ResponseWriter, r *http.Request) {
	ip := httpx.ClientIP(r)
	if p.RL != nil && !p.RL.Allow(ip) {
		w.Header().Set("Retry-After", "1")
		httpx.Error(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	var req debugVerifyReq
	decodeCap := int64(p.maxBody()) + debugDecodeSlack
	if err := httpx.DecodeJSON(w, r, decodeCap, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Body) > p.maxBody() {
		httpx.Error(w, http.StatusBadRequest, "body exceeds the 1 MiB limit")
		return
	}
	if len(req.Headers) > p.maxHeaders() {
		httpx.Error(w, http.StatusBadRequest, "too many headers")
		return
	}
	total := 0
	hdr := http.Header{}
	for k, v := range req.Headers {
		total += len(k) + len(v)
		if total > p.maxHeaderBytes() {
			httpx.Error(w, http.StatusBadRequest, "headers exceed the size limit")
			return
		}
		hdr.Set(k, v)
	}

	provider := verify.Provider(req.Provider)
	if provider == "" {
		if detected, ok := verify.Detect(hdr); ok {
			provider = detected
		}
	}

	res := verify.Verify(verify.Input{
		Provider: provider,
		Secret:   req.Secret,
		Headers:  hdr,
		Body:     []byte(req.Body),
	})

	httpx.JSON(w, http.StatusOK, debugVerifyResp{
		Provider: string(res.Provider),
		Status:   string(res.Status),
		Cause:    string(res.Cause),
		Summary:  res.Summary,
		Details:  nonNilDetails(res.Details),
	})
}
