// Package httpx holds HTTP plumbing shared across the server: middleware
// (panic recovery, request id, structured logging, CORS, body-size limit),
// JSON helpers, and client-IP extraction. None of it ever logs raw request
// bodies or secrets.
package httpx

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"whook/internal/store"
)

type ctxKey int

const (
	ctxRequestID ctxKey = iota
	ctxUserID
	ctxClientIP
	ctxUserAgent
	ctxScopes
)

// WithRequestMeta stashes the client IP + user agent on the context so
// best-effort audit-log writers (activity) can record where/what a request came
// from without threading *http.Request through every handler. Neither is a
// secret value.
func WithRequestMeta(ctx context.Context, ip, userAgent string) context.Context {
	ctx = context.WithValue(ctx, ctxClientIP, ip)
	return context.WithValue(ctx, ctxUserAgent, userAgent)
}

// ClientIPFromContext returns the request's client IP stashed by WithRequestMeta, or "".
func ClientIPFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxClientIP).(string); ok {
		return v
	}
	return ""
}

// UserAgentFromContext returns the request's user agent stashed by WithRequestMeta, or "".
func UserAgentFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxUserAgent).(string); ok {
		return v
	}
	return ""
}

// RequestID returns the request id stored on the context, if any.
func RequestID(ctx context.Context) string {
	if v, ok := ctx.Value(ctxRequestID).(string); ok {
		return v
	}
	return ""
}

// WithUserID returns a context carrying the authenticated user id.
func WithUserID(ctx context.Context, id int64) context.Context {
	return context.WithValue(ctx, ctxUserID, id)
}

// UserID returns the authenticated user id, or 0 if unauthenticated.
func UserID(ctx context.Context) int64 {
	if v, ok := ctx.Value(ctxUserID).(int64); ok {
		return v
	}
	return 0
}

// WithScopes stashes the authorization scopes the current request may use. It is
// set by the auth middleware: API-key auth carries the key's scopes; session
// (cookie) auth and unit tests set nothing, and an absent/empty scope set is
// treated as FULL access by ScopeAllowed (so sessions and legacy keys are
// unrestricted). Scopes are not secret values.
func WithScopes(ctx context.Context, scopes []string) context.Context {
	return context.WithValue(ctx, ctxScopes, scopes)
}

// Scopes returns the scopes stashed on the context, or nil when none were set.
func Scopes(ctx context.Context) []string {
	if v, ok := ctx.Value(ctxScopes).([]string); ok {
		return v
	}
	return nil
}

// ScopeAllowed reports whether the request's scopes permit an action requiring
// want. An absent or empty scope set means FULL access and always allows — this
// keeps session auth and pre-scopes API keys unrestricted.
func ScopeAllowed(ctx context.Context, want string) bool {
	scopes := Scopes(ctx)
	if len(scopes) == 0 {
		return true
	}
	for _, s := range scopes {
		if s == want {
			return true
		}
	}
	return false
}

// Recover converts panics into a 500 and logs with the request id, never the
// panic value's surrounding request body.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic rid=%s %s %s: %v", RequestID(r.Context()), r.Method, r.URL.Path, rec)
				if !headerWritten(w) {
					Error(w, http.StatusInternalServerError, "internal error")
				}
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type wroteFlag struct {
	http.ResponseWriter
	wrote  bool
	status int
}

func (w *wroteFlag) WriteHeader(code int) {
	w.wrote = true
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *wroteFlag) Write(b []byte) (int, error) {
	w.wrote = true
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

// Flush implements http.Flusher when the underlying writer does (needed for SSE).
func (w *wroteFlag) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func headerWritten(w http.ResponseWriter) bool {
	if wf, ok := w.(*wroteFlag); ok {
		return wf.wrote
	}
	return false
}

// RequestIDAndLog assigns a request id and logs method/path/status/duration.
// It never logs bodies.
func RequestIDAndLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rid := r.Header.Get("X-Request-Id")
		if rid == "" {
			rid = store.NewToken(8)
		}
		ctx := context.WithValue(r.Context(), ctxRequestID, rid)
		w.Header().Set("X-Request-Id", rid)

		ww := &wroteFlag{ResponseWriter: w}
		start := time.Now()
		next.ServeHTTP(ww, r.WithContext(ctx))
		log.Printf("rid=%s %s %s -> %d (%s) ip=%s",
			rid, r.Method, r.URL.Path, ww.status, time.Since(start).Round(time.Millisecond), ClientIP(r))
	})
}

// CORS applies a strict CORS policy allowing exactly allowedOrigin with
// credentials. A browser preflight (OPTIONS) is answered here.
func CORS(allowedOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && origin == allowedOrigin {
				w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// EnforceOrigin is a CSRF defense for cookie-authenticated, state-changing
// requests. The session cookie is cross-site (SameSite=None), so a browser will
// attach it to requests initiated by any site; CORS blocks READING our response
// but not the side effect of a "simple" request (e.g. a text/plain POST whose
// body still decodes as JSON, which skips the preflight that already protects
// PUT/PATCH/DELETE). We therefore reject any unsafe-method request whose Origin
// header is present and not the allowed frontend. Legitimate non-browser clients
// (API keys) send no Origin header and are unaffected; the real frontend always
// sends Origin on its cross-site calls and passes.
func EnforceOrigin(allowedOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				// Safe methods and preflight carry no state change.
			default:
				if o := r.Header.Get("Origin"); o != "" && o != allowedOrigin {
					Error(w, http.StatusForbidden, "cross-origin request blocked")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClientIP returns the best-effort client IP, honoring a single X-Forwarded-For
// hop (the server runs behind one trusted proxy/load balancer in production).
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// ExternalBaseURL reconstructs the scheme + host the client originally reached,
// honoring a single trusted proxy's X-Forwarded-Proto / X-Forwarded-Host (Caddy
// sets these; the production deploy binds 127.0.0.1 so these forwarded values
// are trusted). It falls back to the request's own TLS state and Host. The
// result has no trailing slash and no path.
func ExternalBaseURL(r *http.Request) string {
	scheme := "http"
	if p := firstForwardedValue(r.Header.Get("X-Forwarded-Proto")); p != "" {
		scheme = p
	} else if r.TLS != nil {
		scheme = "https"
	}
	host := firstForwardedValue(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = r.Host
	}
	return scheme + "://" + host
}

// ExternalURL reconstructs the full absolute URL the client requested:
// ExternalBaseURL + the request path + the exact raw query as received. This is
// the URL a URL-bound signature scheme (e.g. Twilio) was pointed at.
func ExternalURL(r *http.Request) string {
	u := ExternalBaseURL(r) + r.URL.EscapedPath()
	if r.URL.RawQuery != "" {
		u += "?" + r.URL.RawQuery
	}
	return u
}

// firstForwardedValue returns the first, trimmed entry of a possibly
// comma-separated forwarded header value (only the nearest proxy is trusted).
func firstForwardedValue(v string) string {
	if i := strings.IndexByte(v, ','); i >= 0 {
		v = v[:i]
	}
	return strings.TrimSpace(v)
}

// --- JSON helpers ---

// JSON writes v as a JSON response with the given status.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// Error writes a JSON error envelope: {"error":"..."}.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}

// DecodeJSON reads and decodes a JSON request body with a size cap, rejecting
// unknown fields.
func DecodeJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
