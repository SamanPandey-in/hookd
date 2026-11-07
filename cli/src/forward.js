// Builds the outbound request for the local target from a captured event's
// metadata + raw body, preserving the original method and the relevant headers.
import { signHeaders, detectProvider, RESIGNABLE } from './sign.js';

// Headers that must never be copied verbatim to the new request: hop-by-hop
// headers (RFC 7230 §6.1), plus Host and Content-Length which belong to the
// new connection / are recomputed by fetch.
const DROP = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'accept-encoding',
]);

/**
 * @param {{method?: string, headers?: Array<{name:string,value:string}>}} detail
 * @param {Buffer} body
 * @param {{resign?: boolean, secret?: string|null, provider?: string|null, nowSec?: number}} opts
 * @returns {{method: string, headers: Headers, init: object, resigned: boolean, provider: string|null, note: string|null}}
 */
export function buildRequest(detail, body, opts = {}) {
  const method = String(detail.method || 'POST').toUpperCase();
  const pairs = Array.isArray(detail.headers) ? detail.headers : [];

  const headers = new Headers();
  const lc = {}; // lowercase-keyed snapshot for provider detection
  for (const pair of pairs) {
    if (!pair || !pair.name) continue;
    const ln = pair.name.toLowerCase();
    if (DROP.has(ln)) continue;
    headers.append(pair.name, pair.value ?? '');
    lc[ln] = pair.value ?? '';
  }

  let provider = opts.provider || detectProvider(lc) || null;
  let resigned = false;
  let note = null;

  if (opts.resign) {
    if (!opts.secret) {
      note = 'resign requested but no signing secret (--secret / HOOKD_SIGNING_SECRET); forwarding original signature headers';
    } else if (!provider || !RESIGNABLE.has(provider)) {
      note = `resign requested but provider "${provider || 'unknown'}" is not re-signable from the CLI; forwarding original signature headers`;
    } else {
      try {
        const { headers: sig, replace } = signHeaders(provider, opts.secret, body, opts.nowSec);
        for (const name of replace) headers.delete(name);
        for (const [k, v] of Object.entries(sig)) headers.set(k, v);
        resigned = true;
      } catch (err) {
        note = `resign failed (${err.message}); forwarding original signature headers`;
      }
    }
  }

  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') init.body = body;

  return { method, headers, init, resigned, provider, note };
}
