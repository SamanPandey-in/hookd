// The `listen` command: subscribe to an endpoint's SSE stream and forward each
// captured event to a local URL. Reconnects with backoff when the stream drops;
// stops cleanly when the provided AbortSignal fires (wired to SIGINT in cli.js).
import { parseSSE } from './sse.js';
import { makeClient, ApiError } from './client.js';
import { buildRequest } from './forward.js';
import { RESIGNABLE } from './sign.js';
import { colors } from './colors.js';

// Column widths for the aligned per-event lines. The provider field fits the
// longest provider name ("standard_webhooks" = 17).
const PROVIDER_COL = 17;
const MS_COL = 6;

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

// ---- Boxed start banner ------------------------------------------------------
// Renders a card like:
//   ╭─ hookd listen ───────────────────────────╮
//   │ endpoint   ep_123                          │
//   │ forward    http://localhost:3000/webhooks  │
//   │ re-sign    on · stripe                     │
//   │ api        api.hookd.dev                    │
//   ╰────────────────────────────────────────────╯
// Box-drawing is plain Unicode (not ANSI), so it survives NO_COLOR; only the
// values are tinted, and the tinting is applied after width is measured on the
// raw text so columns stay aligned.
export function renderBanner(opts, c = colors) {
  const { endpointId, forwardUrl, api, resign, provider } = opts;
  let apiHost;
  try {
    apiHost = new URL(api).host || api;
  } catch {
    apiHost = String(api);
  }

  let resignRaw;
  let resignColor;
  if (!resign) {
    resignRaw = 'off';
    resignColor = c.dim;
  } else if (!provider) {
    resignRaw = 'on · auto-detect';
    resignColor = c.cyan;
  } else if (RESIGNABLE.has(provider)) {
    resignRaw = `on · ${provider}`;
    resignColor = c.cyan;
  } else {
    resignRaw = `on · ${provider} (not re-signable — original headers)`;
    resignColor = c.yellow;
  }

  const rows = [
    { label: 'endpoint', value: endpointId, color: c.bold },
    { label: 'forward', value: forwardUrl, color: c.bold },
    { label: 're-sign', value: resignRaw, color: resignColor },
    { label: 'api', value: apiHost, color: (s) => s },
  ];

  const labelW = Math.max(...rows.map((r) => r.label.length));
  const rawLines = rows.map((r) => `${r.label.padEnd(labelW)}  ${r.value}`);
  const titleRaw = '─ hookd listen ';
  // W = total visible width incl. borders; innerW = padded content width.
  const innerW = Math.max(titleRaw.length - 1, ...rawLines.map((s) => s.length));
  const W = innerW + 4;

  const top = `╭─ ${c.bold('hookd listen')} ${'─'.repeat(W - (titleRaw.length + 2))}╮`;
  const bottom = `╰${'─'.repeat(W - 2)}╯`;
  const valueFieldW = innerW - labelW - 2;
  const body = rows.map((r) => {
    const pad = ' '.repeat(Math.max(0, valueFieldW - r.value.length));
    return `│ ${c.gray(r.label.padEnd(labelW))}  ${r.color(r.value)}${pad} │`;
  });
  return [top, ...body, bottom].join('\n');
}

// ---- Loggers -----------------------------------------------------------------
// Human mode: a boxed banner + aligned, glyphed per-event lines on stdout.
// JSON mode (--json): one JSON object per forwarded event on stdout (no ANSI,
// no banner), with all human/status chatter routed to stderr so stdout pipes
// cleanly.
export function makeLogger({ json = false, c = colors } = {}) {
  if (json) {
    const emit = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
    return {
      json: true,
      banner: () => {},
      info: (m) => process.stderr.write(`hookd ${m}\n`),
      warn: (m) => process.stderr.write(`hookd ${m}\n`),
      error: (m) => process.stderr.write(`hookd ${m}\n`),
      forward: ({ status, ms, provider, eventType, resigned, note }) =>
        emit({
          ok: status >= 200 && status < 300,
          status,
          ms,
          provider: provider || null,
          event_type: eventType || null,
          resigned: Boolean(resigned),
          note: note || null,
        }),
      forwardError: ({ id, ms, provider, eventType, error }) =>
        emit({
          ok: false,
          status: null,
          ms,
          id,
          provider: provider || null,
          event_type: eventType || null,
          error,
        }),
    };
  }

  const msCol = (ms) => c.dim(`${ms}ms`.padStart(MS_COL));
  const provCol = (p) => (p || '-').padEnd(PROVIDER_COL);
  return {
    json: false,
    banner: (text) => process.stdout.write(`${text}\n`),
    info: (m) => process.stdout.write(`${c.gray('hookd')} ${m}\n`),
    warn: (m) => process.stderr.write(`${c.yellow('hookd')} ${m}\n`),
    error: (m) => process.stderr.write(`${c.red('hookd')} ${m}\n`),
    forward: ({ status, ms, provider, eventType, resigned, note }) => {
      const ok = status >= 200 && status < 300;
      const raw = String(status).padStart(3);
      const glyph = ok ? c.green('✓') : c.red('✕');
      const code = ok ? c.green(raw) : c.red(raw);
      let line = `${glyph} ${code}  ${msCol(ms)}  ${provCol(provider)}  ${eventType || '-'}`;
      if (resigned) line += `  ${c.cyan('re-signed')}`;
      else if (note) line += `  ${c.dim(`(${note})`)}`;
      process.stdout.write(`${line}\n`);
    },
    forwardError: ({ ms, provider, eventType, error }) => {
      const line = `${c.red('✕')} ${c.red('ERR')}  ${msCol(ms)}  ${provCol(provider)}  ${eventType || '-'}  ${c.dim(`forward failed: ${error}`)}`;
      process.stderr.write(`${line}\n`);
    },
  };
}

// Back-compat alias; prefer makeLogger().
export function defaultLogger() {
  return makeLogger({ json: false });
}

async function forwardOne(client, parsed, ctx) {
  const id = extractEventId(parsed);
  if (!id) {
    ctx.logger.warn('received an event without an id; skipping');
    return;
  }
  const started = Date.now();
  let detail = null;
  try {
    detail = await client.getEvent(id, ctx.signal);
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

    ctx.logger.forward({
      status: res.status,
      ms: Date.now() - started,
      provider: req.provider,
      eventType: detail.event_type,
      resigned: req.resigned,
      note: req.note,
    });
  } catch (err) {
    if (aborted(ctx.signal)) return;
    const info = {
      id,
      ms: Date.now() - started,
      provider: ctx.provider || (detail && detail.verify_provider) || null,
      eventType: detail && detail.event_type,
      error: err.message,
    };
    if (ctx.logger.forwardError) ctx.logger.forwardError(info);
    else ctx.logger.error(`forward of ${id} failed: ${err.message}`);
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
    json = false,
    secret = null,
    provider = null,
    signal,
    fetchImpl = fetch,
    backoffBaseMs = 500,
    backoffMaxMs = 30000,
    nowSec,
  } = opts;
  const logger = opts.logger || makeLogger({ json });

  const client = makeClient({ api, key, fetchImpl });

  if (logger.banner) logger.banner(renderBanner({ endpointId, forwardUrl, api: client.base, resign, provider }));
  logger.info('listening for events… (ctrl-c to stop)');

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
