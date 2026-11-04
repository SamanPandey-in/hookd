// Package auth implements GitHub OAuth login and signed-cookie sessions, plus
// middleware that requires a valid session on /api/* routes.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	sessionCookie = "whook_session"
	stateCookie   = "whook_oauth_state"
)

// Sessions mints and verifies signed session cookies. The cookie value is
// "<payload>.<hmac>" where payload is base64url("<userID>:<expiryUnix>") and
// hmac is base64url(HMAC-SHA256(payload, key)). No DB lookup is needed to
// authenticate a request; revocation is by key rotation / short TTL.
type Sessions struct {
	key      []byte
	secure   bool
	sameSite http.SameSite
	domain   string
	ttl      time.Duration
}

// NewSessions builds a session manager. ttl defaults to 7 days. sameSite/domain
// control cross-site behavior: a Vercel+EC2 split needs SameSiteNone (with
// secure=true); a shared parent domain can keep Lax with domain=".example.com".
func NewSessions(key []byte, secure bool, sameSite http.SameSite, domain string, ttl time.Duration) *Sessions {
	if ttl <= 0 {
		ttl = 7 * 24 * time.Hour
	}
	if sameSite == 0 {
		sameSite = http.SameSiteLaxMode
	}
	return &Sessions{key: key, secure: secure, sameSite: sameSite, domain: domain, ttl: ttl}
}

// sign returns the signed cookie value for a user id and expiry.
func (s *Sessions) sign(userID int64, expiry time.Time) string {
	payload := base64.RawURLEncoding.EncodeToString(
		[]byte(fmt.Sprintf("%d:%d", userID, expiry.Unix())))
	mac := s.mac(payload)
	return payload + "." + mac
}

func (s *Sessions) mac(payload string) string {
	h := hmac.New(sha256.New, s.key)
	h.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

// Verify checks a cookie value and returns the user id if valid and unexpired.
func (s *Sessions) Verify(value string) (int64, error) {
	payload, sig, ok := strings.Cut(value, ".")
	if !ok {
		return 0, errors.New("auth: malformed session cookie")
	}
	expected := s.mac(payload)
	if subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return 0, errors.New("auth: bad session signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return 0, errors.New("auth: bad session payload")
	}
	idStr, expStr, ok := strings.Cut(string(raw), ":")
	if !ok {
		return 0, errors.New("auth: bad session payload format")
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return 0, errors.New("auth: bad session user id")
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return 0, errors.New("auth: bad session expiry")
	}
	if time.Now().After(time.Unix(exp, 0)) {
		return 0, errors.New("auth: session expired")
	}
	return id, nil
}

// SetCookie writes a session cookie for userID.
func (s *Sessions) SetCookie(w http.ResponseWriter, userID int64) {
	expiry := time.Now().Add(s.ttl)
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    s.sign(userID, expiry),
		Path:     "/",
		Domain:   s.domain,
		Expires:  expiry,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: s.sameSite,
	})
}

// Clear removes the session cookie.
func (s *Sessions) Clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		Domain:   s.domain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: s.sameSite,
	})
}

// FromRequest extracts and verifies the session from an incoming request.
func (s *Sessions) FromRequest(r *http.Request) (int64, error) {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return 0, errors.New("auth: no session cookie")
	}
	return s.Verify(c.Value)
}
