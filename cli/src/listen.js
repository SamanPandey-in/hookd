// The `listen` command: subscribe to an endpoint's SSE stream and forward each
// captured event to a local URL. Reconnects with backoff when the stream drops;
// stops cleanly when the provided AbortSignal fires (wired to SIGINT in cli.js).
import { parseSSE } from './sse.js';
import { makeClient, ApiError } from './client.js';
import { buildRequest } from './forward.js';
import { colors } from './colors.js';

const aborted = (signal) => Boolean(signal && signal.aborted);

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (aborted(signal)) return resolve();
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    }
  });
}

function backoff(attempt, base, max) {
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  // Full-ish jitter: half fixed, half random, to avoid thundering reconnects.
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

// ---- SSE event shape adapters (single place to change if the shape evolves) --
// Today the stream emits {id, endpoint_id, method, ..., verify_status} with NO
// body inline, so we GET /events/{id}/body for the payload. If the stream later
// inlines the body, hasInlineBody/inlineBody below start returning it and the
// extra fetch is skipped — a one-line change each.
export function extractEventId(parsed) {
  return (parsed && (parsed.id || parsed.event_id)) || null;
}
export function hasInlineBody(parsed) {
  return Boolean(parsed && (typeof parsed.body_base64 === 'string' || typeof parsed.body === 'string'));
}
export function inlineBody(parsed) {
  if (typeof parsed.body_base64 === 'string') return Buffer.from(parsed.body_base64, 'base64');
  return Buffer.from(parsed.body, 'utf8');
}

export function defaultLogger() {
  return {
    info: (m) => process.stdout.write(`${colors.gray('hookd')} ${m}\n`),
    warn: (m) => process.stderr.write(`${colors.yellow('hookd')} ${m}\n`),
    error: (m) => process.stderr.write(`${colors.red('hookd')} ${m}\n`),
    forward: (status, ms, label, req) => {
      const ok = status >= 200 && status < 300;
      const code = ok ? colors.green(String(status)) : colors.red(String(status));
      const arrow = ok ? colors.green('→') : colors.yellow('→');
      let line = `${arrow} ${code}  ${colors.dim(`${ms}ms`)}  ${label}`;
      if (req.resigned) line += `  ${colors.cyan('re-signed')}`;
      if (req.note) line += `  ${colors.dim(`(${req.note})`)}`;
      process.stdout.write(`${line}\n`);
    },
  };
}

async function forwardOne(client, parsed, ctx) {
  const id = extractEventId(parsed);
  if (!id) {
    ctx.logger.warn('received an event without an id; skipping');
    return;
  }
  const started = Date.now();
  try {
    const detail = await client.getEvent(id, ctx.signal);
    const body = hasInlineBody(parsed)
      ? inlineBody(parsed)
      : await client.getEventBody(id, ctx.signal);

    const req = buildRequest(detail, body, {
      resign: ctx.resign,
      secret: ctx.secret,
      provider: ctx.provider,
      nowSec: ctx.nowSec,
    });

    const res = await ctx.fetchImpl(ctx.forwardUrl, { ...req.init, signal: ctx.signal });
    // Drain the body so the socket is freed.
    try { await res.arrayBuffer(); } catch { /* ignore */ }

    const ms = Date.now() - started;
    const label = `${req.provider || '-'}  ${detail.event_type || '-'}`;
    ctx.logger.forward(res.status, ms, label, req);
  } catch (err) {
    if (aborted(ctx.signal)) return;
    ctx.logger.error(`forward of ${id} failed: ${err.message}`);
  }
}

/**
 * Run the listen loop until `signal` aborts.
 * @returns {Promise<number>} process exit code
 */
export async function runListen(opts) {
  const {
    endpointId,
    forwardUrl,
    api,
    key,
    resign = false,
    secret = null,
    provider = null,
    signal,
    logger = defaultLogger(),
    fetchImpl = fetch,
    backoffBaseMs = 500,
    backoffMaxMs = 30000,
    nowSec,
  } = opts;

  const client = makeClient({ api, key, fetchImpl });

  logger.info(
    `forwarding ${client.base} endpoint ${colors.bold(endpointId)} → ${colors.bold(forwardUrl)}${resign ? colors.cyan(' [re-sign]') : ''}`,
  );

  let attempt = 0;
  while (!aborted(signal)) {
    let res;
    try {
      res = await client.openStream(endpointId, signal);
    } catch (err) {
      if (aborted(signal)) break;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        logger.error(`authentication failed (HTTP ${err.status}) — check your API key (--key / HOOKD_API_KEY)`);
        return 1;
      }
      attempt += 1;
      const delay = backoff(attempt, backoffBaseMs, backoffMaxMs);
      logger.warn(`could not open stream (${err.message}); retrying in ${delay}ms`);
      await sleep(delay, signal);
      continue;
    }

    attempt = 0; // connected: reset backoff
    logger.info(colors.green('stream connected'));

    const ctx = { forwardUrl, resign, secret, provider, logger, fetchImpl, signal, nowSec };
    try {
      for await (const msg of parseSSE(res.body)) {
        if (aborted(signal)) break;
        if (msg.event !== 'event') continue; // skip keepalives / unknown events
        let parsed;
        try {
          parsed = JSON.parse(msg.data);
        } catch {
          continue;
        }
        await forwardOne(client, parsed, ctx);
      }
    } catch (err) {
      if (aborted(signal)) break;
      logger.warn(`stream error (${err.message})`);
    }

    if (aborted(signal)) break;
    attempt += 1;
    const delay = backoff(attempt, backoffBaseMs, backoffMaxMs);
    logger.warn(`stream closed; reconnecting in ${delay}ms`);
    await sleep(delay, signal);
  }

  logger.info('stopped');
  return 0;
}
