// Package cryptox provides authenticated encryption for secrets at rest.
//
// Signing secrets configured by users (Stripe whsec_…, GitHub secrets, etc.)
// are encrypted with AES-256-GCM before they touch the database and decrypted
// only transiently in memory when a verifier or signer needs them. The key is
// the 32-byte SECRET_ENC_KEY from config.
package cryptox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
)

// ErrKeySize is returned when the provided key is not 32 bytes.
var ErrKeySize = errors.New("cryptox: key must be 32 bytes (AES-256)")

// Cipher encrypts and decrypts short secrets with AES-256-GCM.
type Cipher struct {
	aead cipher.AEAD
}

// New returns a Cipher using the given 32-byte key.
func New(key []byte) (*Cipher, error) {
	if len(key) != 32 {
		return nil, ErrKeySize
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("cryptox: new cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("cryptox: new gcm: %w", err)
	}
	return &Cipher{aead: aead}, nil
}

// Encrypt seals plaintext and returns nonce||ciphertext. The nonce is random
// per call, so encrypting the same secret twice yields different output.
func (c *Cipher) Encrypt(plaintext []byte) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("cryptox: read nonce: %w", err)
	}
	// Seal appends the ciphertext to nonce, so the nonce prefixes the result.
	return c.aead.Seal(nonce, nonce, plaintext, nil), nil
}

// Decrypt opens data produced by Encrypt (nonce||ciphertext).
func (c *Cipher) Decrypt(data []byte) ([]byte, error) {
	ns := c.aead.NonceSize()
	if len(data) < ns {
		return nil, errors.New("cryptox: ciphertext too short")
	}
	nonce, ct := data[:ns], data[ns:]
	pt, err := c.aead.Open(nil, nonce, ct, nil)
	if err != nil {
		return nil, fmt.Errorf("cryptox: decrypt failed (wrong key or corrupt data): %w", err)
	}
	return pt, nil
}

// EncryptString is a convenience wrapper for string secrets.
func (c *Cipher) EncryptString(s string) ([]byte, error) { return c.Encrypt([]byte(s)) }

// DecryptString is a convenience wrapper returning a string.
func (c *Cipher) DecryptString(data []byte) (string, error) {
	b, err := c.Decrypt(data)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// Mask returns a safe display form of a secret: a short prefix plus a redacted
// tail, so it can be shown in the UI/logs without ever revealing it in full.
func Mask(secret string) string {
	if secret == "" {
		return ""
	}
	n := len(secret)
	// Show at most the first 6 characters of a longer secret.
	keep := 6
	if n <= keep {
		// Very short secret: reveal nothing.
		return "••••"
	}
	return secret[:keep] + "…••••"
}
