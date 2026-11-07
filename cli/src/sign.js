// CLI-side re-signing. These implementations are the exact inverse of the
// server's `verify` package signers (server/internal/verify/*.go) so that a
// request re-signed here passes the same provider's verification downstream.
//
// Re-signing requires the endpoint's signing secret, supplied at RUNTIME via
// --secret / HOOKD_SIGNING_SECRET. The secret is NEVER embedded in or required
// by the CLI; if it's absent we fall back to forwarding the original captured
// signature headers unchanged (see forward.js / CLI.md).
import crypto from 'node:crypto';

function hmac256(key, bufOrStr) {
  return crypto.createHmac('sha256', key).update(bufOrStr).digest();
}

const asBuf = (body) => (Buffer.isBuffer(body) ? body : Buffer.from(body));

/** Providers we can re-sign, mirroring verify.Provider string values. */
export const RESIGNABLE = new Set(['stripe', 'github', 'razorpay', 'shopify', 'standard_webhooks']);

/**
 * Compute fresh signature headers for a provider.
 * @param {string} provider  verify.Provider string value
 * @param {string} secret    signing secret
 * @param {Buffer|string} body raw body bytes
 * @param {number} [nowSec]   unix seconds to embed (defaults to now); used by tests
 * @returns {{headers: Record<string,string>, replace: string[]}} headers to set
 *          and the header names (lowercase) any original copies of which must be
 *          dropped before setting these.
 */
export function signHeaders(provider, secret, body, nowSec) {
  const b = asBuf(body);
  const t = String(nowSec ?? Math.floor(Date.now() / 1000));

  switch (provider) {
    case 'stripe': {
      // Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256 over "t.payload">
      const sig = hmac256(secret, Buffer.concat([Buffer.from(`${t}.`), b])).toString('hex');
      return {
        headers: { 'Stripe-Signature': `t=${t},v1=${sig}` },
        replace: ['stripe-signature'],
      };
    }
    case 'github': {
      // X-Hub-Signature-256: sha256=<hex HMAC-SHA256 over body>
      const sig = hmac256(secret, b).toString('hex');
      return {
        headers: { 'X-Hub-Signature-256': `sha256=${sig}` },
        replace: ['x-hub-signature-256', 'x-hub-signature'],
      };
    }
    case 'razorpay': {
      // X-Razorpay-Signature: <hex HMAC-SHA256 over body>, no prefix, no timestamp
      const sig = hmac256(secret, b).toString('hex');
      return {
        headers: { 'X-Razorpay-Signature': sig },
        replace: ['x-razorpay-signature'],
      };
    }
    case 'shopify': {
      // X-Shopify-Hmac-Sha256: <base64 HMAC-SHA256 over body>
      const sig = hmac256(secret, b).toString('base64');
      return {
        headers: { 'X-Shopify-Hmac-Sha256': sig },
        replace: ['x-shopify-hmac-sha256'],
      };
    }
    case 'standard_webhooks': {
      // Svix/Standard Webhooks: key = base64-decode(secret without "whsec_").
      // id  = "msg_" + hex(sha256("ts." + body))[:24]
      // sig = base64 HMAC-SHA256 over "id.ts.payload"
      const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
      let key;
      try {
        key = Buffer.from(raw, 'base64');
        if (key.length === 0) throw new Error('empty');
      } catch {
        throw new Error('standard_webhooks secret is not valid base64 after the whsec_ prefix');
      }
      const idHex = crypto
        .createHash('sha256')
        .update(Buffer.concat([Buffer.from(`${t}.`), b]))
        .digest('hex');
      const id = `msg_${idHex.slice(0, 24)}`;
      const sig = hmac256(key, Buffer.concat([Buffer.from(`${id}.${t}.`), b])).toString('base64');
      return {
        headers: {
          'Webhook-Signature': `v1,${sig}`,
          'Webhook-Id': id,
          'Webhook-Timestamp': t,
        },
        replace: ['webhook-signature', 'webhook-id', 'webhook-timestamp'],
      };
    }
    default:
      throw new Error(`cannot re-sign provider "${provider}" from the CLI`);
  }
}

/**
 * Guess the provider from the presence of signature headers (same precedence
 * as verify.Detect). `headers` is a plain lowercase-keyed object.
 * @returns {string|null}
 */
export function detectProvider(headers) {
  const h = (name) => headers[name] !== undefined && headers[name] !== '';
  if (h('stripe-signature')) return 'stripe';
  if (h('x-hub-signature-256') || h('x-hub-signature')) return 'github';
  if (h('x-razorpay-signature')) return 'razorpay';
  if (h('x-shopify-hmac-sha256')) return 'shopify';
  if (h('webhook-signature') && h('webhook-id') && h('webhook-timestamp')) return 'standard_webhooks';
  return null;
}
