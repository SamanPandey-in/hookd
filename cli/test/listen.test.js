// Integration tests for the forward path. We stand up a real stub hookd API
// (SSE stream + event detail + event body) and a local sink, both on ephemeral
// ports, and assert the CLI forwards a captured event to the sink with the
// right method, body and (re-signed) headers. No new dependencies: node:test,
// node:http, node:crypto only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { runListen } from '../src/listen.js';
import { signHeaders } from '../src/sign.js';

const KEY = 'whk_live_testkey';
const SECRET = 'whsec_test_secret';

function silentLogger() {
  return { info() {}, warn() {}, error() {}, forward() {} };
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
}
function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
const portOf = (server) => server.address().port;

// A sink that captures the first request it receives (method, headers, body).
function makeSink() {
  let resolveReq;
  const requests = [];
  const first = new Promise((r) => (resolveReq = r));
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rec = {
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      requests.push(rec);
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      if (resolveReq) {
        resolveReq(rec);
        resolveReq = null;
      }
    });
  });
  return { server, requests, first };
}

// A stub hookd API. Emits exactly `events` (array of {id, detail, body}) on each
// SSE connection. If `closeAfterEmit` is set, it ends the SSE response after the
// first event so the client must reconnect.
function makeStub({ events, closeAfterEmit = false }) {
  const state = { connections: 0, authHeaders: [] };
  const byId = new Map(events.map((e) => [e.id, e]));

  const server = http.createServer((req, res) => {
    state.authHeaders.push(req.headers.authorization || '');
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    const bodyMatch = p.match(/^\/api\/events\/([^/]+)\/body$/);
    const detailMatch = p.match(/^\/api\/events\/([^/]+)$/);
    const streamMatch = p.match(/^\/api\/endpoints\/([^/]+)\/stream$/);

    if (bodyMatch) {
      const ev = byId.get(bodyMatch[1]);
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(ev ? ev.body : Buffer.alloc(0));
      return;
    }
    if (detailMatch) {
      const ev = byId.get(detailMatch[1]);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(ev ? ev.detail : {}));
      return;
    }
    if (streamMatch) {
      const conn = ++state.connections;
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      // On reconnect (conn>=2) still emit so the forward is observable.
      for (const ev of events) {
        res.write(`event: event\n`);
        res.write(`data: ${JSON.stringify(ev.summary)}\n\n`);
      }
      if (closeAfterEmit) {
        res.end();
      }
      // else: keep the connection open until the client aborts.
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return { server, state };
}

function sampleEvent(id, bodyStr) {
  return {
    id,
    summary: { id, endpoint_id: 'ep_test', method: 'POST', event_type: 'charge.succeeded', verify_status: 'passed' },
    detail: {
      id,
      endpoint_id: 'ep_test',
      method: 'POST',
      event_type: 'charge.succeeded',
      content_type: 'application/json',
      headers: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Stripe-Signature', value: 't=1,v1=stale_original_signature' },
        { name: 'Host', value: 'ignored.example.com' },
        { name: 'X-Custom', value: 'keepme' },
      ],
    },
    body: Buffer.from(bodyStr),
  };
}

test('forwards a captured event to the local sink with method + body preserved', async () => {
  const bodyStr = '{"amount":4200,"currency":"usd"}';
  const stub = makeStub({ events: [sampleEvent('ev_1', bodyStr)] });
  const sink = makeSink();
  await listen(stub.server);
  await listen(sink.server);

  const controller = new AbortController();
  const done = runListen({
    endpointId: 'ep_test',
    forwardUrl: `http://127.0.0.1:${portOf(sink.server)}/webhooks`,
    api: `http://127.0.0.1:${portOf(stub.server)}`,
    key: KEY,
    signal: controller.signal,
    logger: silentLogger(),
    backoffBaseMs: 10,
  });

  const rec = await sink.first;
  controller.abort();
  await done;

  assert.equal(rec.method, 'POST');
  assert.equal(rec.body, bodyStr);
  assert.equal(rec.headers['x-custom'], 'keepme');
  // Host is not forwarded verbatim (dropped as a connection header).
  assert.notEqual(rec.headers.host, 'ignored.example.com');
  // Without --resign the original signature header is forwarded unchanged.
  assert.equal(rec.headers['stripe-signature'], 't=1,v1=stale_original_signature');
  // Every API request carried the bearer key.
  assert.ok(stub.state.authHeaders.every((h) => h === `Bearer ${KEY}`));

  await close(stub.server);
  await close(sink.server);
});

test('--resign replaces the Stripe signature with a fresh, valid one', async () => {
  const bodyStr = '{"amount":999}';
  const stub = makeStub({ events: [sampleEvent('ev_2', bodyStr)] });
  const sink = makeSink();
  await listen(stub.server);
  await listen(sink.server);

  const nowSec = 1762500000; // deterministic timestamp for assertion
  const controller = new AbortController();
  const done = runListen({
    endpointId: 'ep_test',
    forwardUrl: `http://127.0.0.1:${portOf(sink.server)}/webhooks`,
    api: `http://127.0.0.1:${portOf(stub.server)}`,
    key: KEY,
    resign: true,
    secret: SECRET,
    signal: controller.signal,
    logger: silentLogger(),
    backoffBaseMs: 10,
    nowSec,
  });

  const rec = await sink.first;
  controller.abort();
  await done;

  // Expected header == what the server's verify.Sign would produce for stripe.
  const expected = signHeaders('stripe', SECRET, Buffer.from(bodyStr), nowSec).headers['Stripe-Signature'];
  assert.equal(rec.headers['stripe-signature'], expected);
  // Sanity: the fresh signature is a correct HMAC over "t.payload".
  const v1 = crypto
    .createHmac('sha256', SECRET)
    .update(Buffer.concat([Buffer.from(`${nowSec}.`), Buffer.from(bodyStr)]))
    .digest('hex');
  assert.equal(rec.headers['stripe-signature'], `t=${nowSec},v1=${v1}`);
  assert.notEqual(rec.headers['stripe-signature'], 't=1,v1=stale_original_signature');

  await close(stub.server);
  await close(sink.server);
});

test('reconnects after the stream drops and keeps forwarding', async () => {
  const bodyStr = '{"n":1}';
  const stub = makeStub({ events: [sampleEvent('ev_3', bodyStr)], closeAfterEmit: true });
  const hits = [];
  let resolveTwo;
  const gotTwo = new Promise((r) => (resolveTwo = r));
  const sinkServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      hits.push(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200);
      res.end('ok');
      if (hits.length >= 2 && resolveTwo) {
        resolveTwo();
        resolveTwo = null;
      }
    });
  });
  await listen(stub.server);
  await listen(sinkServer);

  const controller = new AbortController();
  const done = runListen({
    endpointId: 'ep_test',
    forwardUrl: `http://127.0.0.1:${portOf(sinkServer)}/`,
    api: `http://127.0.0.1:${portOf(stub.server)}`,
    key: KEY,
    signal: controller.signal,
    logger: silentLogger(),
    backoffBaseMs: 10,
    backoffMaxMs: 50,
  });

  await gotTwo;
  controller.abort();
  await done;

  assert.ok(stub.state.connections >= 2, `expected >=2 stream connections, got ${stub.state.connections}`);
  assert.ok(hits.length >= 2, `expected >=2 forwards, got ${hits.length}`);

  await close(stub.server);
  await close(sinkServer);
});
