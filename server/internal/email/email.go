// Package email is a drop-in transactional-email scaffold. It is INERT BY
// DEFAULT: with no SMTP configuration the no-op sender logs a "would send" line
// and sends nothing, so the server runs unchanged until real credentials are
// provided. It is intentionally minimal — plain-text messages only, no HTML, no
// templating engine, no attachments.
//
// Security: this package NEVER logs message bodies or SMTP credentials. The
// no-op logger records only the recipient and subject (neither is a secret).
//
// Scope: transactional mail only (e.g. a dunning "your payment is failing"
// notice). It must NOT be used for receipts — Dodo is the merchant of record and
// handles those — nor for marketing.
package email

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// Message is one plain-text email. Body is never logged.
type Message struct {
	To      string
	Subject string
	Body    string // plain text
}

// Sender delivers a transactional message. Implementations are safe for
// concurrent use. Send is best-effort at the call site: callers log failures
// rather than treating them as fatal.
type Sender interface {
	Send(ctx context.Context, msg Message) error
}

// Config is the SMTP configuration, read from the environment by
// internal/config. When Host or From is empty the package is INERT (New returns
// a no-op sender). No field is logged.
type Config struct {
	Host     string // SMTP_HOST (e.g. "smtp.postmarkapp.com"); "" => inert
	Port     int    // SMTP_PORT (e.g. 587)
	Username string // SMTP_USERNAME
	Password string // SMTP_PASSWORD (never logged)
	From     string // EMAIL_FROM (e.g. "hookd <no-reply@hookd.dev>"); "" => inert
}

// Configured reports whether real SMTP delivery is wired. When false the package
// is inert and New returns a no-op sender.
func (c Config) Configured() bool {
	return strings.TrimSpace(c.Host) != "" && strings.TrimSpace(c.From) != ""
}

// New returns a Sender for the given config. When the config is not Configured
// it returns a no-op sender that logs "would send" and delivers nothing — so the
// scaffold is drop-in: set SMTP_* + EMAIL_FROM and real delivery begins with no
// code change.
func New(c Config) Sender {
	if !c.Configured() {
		return noopSender{}
	}
	if c.Port == 0 {
		c.Port = 587
	}
	return &smtpSender{cfg: c}
}

// noopSender is the inert default. It logs the recipient + subject (never the
// body or any credential) so operators can see mail WOULD have been sent, then
// returns nil so callers treat it as a successful best-effort send.
type noopSender struct{}

func (noopSender) Send(_ context.Context, msg Message) error {
	log.Printf("email: would send to=%q subject=%q (delivery inert: SMTP not configured)", msg.To, msg.Subject)
	return nil
}

// smtpSender delivers via stdlib net/smtp over STARTTLS (the common submission
// path on port 587). It honors the context deadline for the dial.
type smtpSender struct {
	cfg Config
}

func (s *smtpSender) Send(ctx context.Context, msg Message) error {
	addr := net.JoinHostPort(s.cfg.Host, fmt.Sprintf("%d", s.cfg.Port))

	d := net.Dialer{}
	if _, ok := ctx.Deadline(); !ok {
		// Default dial timeout so a send can never block a caller indefinitely.
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
	}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("email: dial %s: %w", s.cfg.Host, err)
	}

	c, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("email: smtp client: %w", err)
	}
	defer func() { _ = c.Close() }()

	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: s.cfg.Host}); err != nil {
			return fmt.Errorf("email: starttls: %w", err)
		}
	}
	if s.cfg.Username != "" {
		auth := smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
		if ok, _ := c.Extension("AUTH"); ok {
			if err := c.Auth(auth); err != nil {
				return fmt.Errorf("email: auth: %w", err)
			}
		}
	}
	if err := c.Mail(fromAddress(s.cfg.From)); err != nil {
		return fmt.Errorf("email: MAIL FROM: %w", err)
	}
	if err := c.Rcpt(msg.To); err != nil {
		return fmt.Errorf("email: RCPT TO: %w", err)
	}
	wc, err := c.Data()
	if err != nil {
		return fmt.Errorf("email: DATA: %w", err)
	}
	if _, err := wc.Write(buildMessage(s.cfg.From, msg)); err != nil {
		_ = wc.Close()
		return fmt.Errorf("email: write body: %w", err)
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("email: close body: %w", err)
	}
	return c.Quit()
}

// buildMessage renders minimal RFC 5322 plain-text headers + body. No logging.
func buildMessage(from string, msg Message) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", msg.To)
	fmt.Fprintf(&b, "Subject: %s\r\n", msg.Subject)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("\r\n")
	b.WriteString(msg.Body)
	return []byte(b.String())
}

// fromAddress extracts the bare address from a "Name <addr>" From value for the
// SMTP envelope (MAIL FROM), falling back to the raw value.
func fromAddress(from string) string {
	if i := strings.LastIndex(from, "<"); i >= 0 {
		if j := strings.Index(from[i:], ">"); j > 0 {
			return strings.TrimSpace(from[i+1 : i+j])
		}
	}
	return strings.TrimSpace(from)
}
