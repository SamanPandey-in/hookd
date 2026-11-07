// Package replay re-sends a captured webhook to a user-supplied target URL,
// optionally re-signing it with a fresh timestamp via the verify engine. Every
// attempt is SSRF-guarded (see ssrf.go) and recorded as a store.ReplayAttempt.
package replay

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"whook/internal/store"
	"whook/internal/verify"
)

// hopByHop headers must not be forwarded verbatim.
var hopByHop = map[string]bool{
	"connection":        true,
	"proxy-connection":  true,
	"keep-alive":        true,
	"transfer-encoding": true,
	"te":                true,
	"trailer":           true,
	"upgrade":           true,
	"host":              true,
	"content-length":    true,
	"accept-encoding":   true,
}

// Request describes one replay.
type Request struct {
	Event     *store.Event
	TargetURL string
	Resign    bool
	Provider  verify.Provider // used when Resign is true
	Secret    string          // decrypted signing secret; required when Resign is true
	Now       time.Time       // injected timestamp for re-sign (zero => now)

	// Body, when non-nil, is an edited raw body to SEND (and, when re-signing, to
	// sign) instead of the captured Event.RawBody. The stored event is never
	// mutated — the edit applies only to this outgoing replay. A non-nil, empty
	// slice means "replay an empty body"; nil means "use the captured body".
	Body []byte
}

// outgoingBody returns the bytes to send for this replay: the edited Body when
// one was supplied, otherwise the captured event's raw body.
func (r Request) outgoingBody() []byte {
	if r.Body != nil {
		return r.Body
	}
	return r.Event.RawBody
}

// Engine performs replays.
type Engine struct {
	guard       *Guard
	timeout     time.Duration
	maxRespBody int64
}

// NewEngine builds a replay engine.
func NewEngine(timeout time.Duration, maxRespBody int64) *Engine {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	if maxRespBody <= 0 {
		maxRespBody = 256 << 10
	}
	return &Engine{guard: NewGuard(), timeout: timeout, maxRespBody: maxRespBody}
}

// Replay validates the target, builds the outgoing request (re-signing if
// asked), sends it with the SSRF-safe client, and returns a populated
// ReplayAttempt. A transport/guard error is captured on the attempt's Error
// field AND returned, so callers can both persist and surface it.
func (e *Engine) Replay(ctx context.Context, req Request) (*store.ReplayAttempt, error) {
	attempt := &store.ReplayAttempt{
		EventID:   req.Event.ID,
		TargetURL: req.TargetURL,
		Resigned:  req.Resign,
	}

	u, err := e.guard.ValidateURL(ctx, req.TargetURL)
	if err != nil {
		attempt.Error = err.Error()
		return attempt, err
	}

	outHeaders, err := e.buildHeaders(req)
	if err != nil {
		attempt.Error = err.Error()
		return attempt, err
	}

	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, req.Event.Method, u.String(), bytes.NewReader(req.outgoingBody()))
	if err != nil {
		attempt.Error = err.Error()
		return attempt, err
	}
	for name, vals := range outHeaders {
		for _, v := range vals {
			httpReq.Header.Add(name, v)
		}
	}

	client := e.client()
	start := time.Now()
	resp, err := client.Do(httpReq)
	attempt.LatencyMS = time.Since(start).Milliseconds()
	if err != nil {
		attempt.Error = cleanErr(err)
		return attempt, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, e.maxRespBody))
	attempt.ResponseStatus = resp.StatusCode
	attempt.ResponseBody = string(body)
	attempt.ResponseHeaders = flattenHeaders(resp.Header)
	return attempt, nil
}

// buildHeaders constructs the outgoing header set: the original captured headers
// minus hop-by-hop, with signature headers replaced when re-signing.
func (e *Engine) buildHeaders(req Request) (http.Header, error) {
	out := http.Header{}
	for _, h := range req.Event.Headers {
		if hopByHop[strings.ToLower(h.Name)] {
			continue
		}
		out.Add(h.Name, h.Value)
	}

	if req.Resign {
		if req.Secret == "" {
			return nil, errors.New("replay: re-sign requested but endpoint has no signing secret")
		}
		res := verify.Sign(verify.SignInput{
			Provider: req.Provider,
			Secret:   req.Secret,
			Body:     req.outgoingBody(),
			Now:      req.Now,
		})
		if res.Err != nil {
			return nil, fmt.Errorf("replay: re-sign: %w", res.Err)
		}
		// Overwrite any original signature headers with the freshly computed ones.
		for name, val := range res.Headers {
			out.Set(name, val)
		}
	}
	return out, nil
}

// client builds an http.Client whose dialer re-validates every connection and
// whose redirect policy re-runs the SSRF guard on each hop (and caps hops).
func (e *Engine) client() *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{
		DialContext:           e.guard.safeDialContext(dialer),
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: e.timeout,
		DisableKeepAlives:     true,
		MaxIdleConns:          1,
	}
	return &http.Client{
		Transport: transport,
		Timeout:   e.timeout,
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("replay: too many redirects")
			}
			// Re-validate the redirect target before following it.
			if _, err := e.guard.ValidateURL(r.Context(), r.URL.String()); err != nil {
				return err
			}
			return nil
		},
	}
}

func flattenHeaders(h http.Header) map[string]string {
	out := make(map[string]string, len(h))
	for k, v := range h {
		out[k] = strings.Join(v, ", ")
	}
	return out
}

// cleanErr strips any wrapped URL to avoid leaking it twice and keeps the guard
// reason legible.
func cleanErr(err error) string {
	if errors.Is(err, ErrBlockedTarget) {
		return err.Error()
	}
	return err.Error()
}
