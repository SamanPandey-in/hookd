// A tiny Server-Sent Events reader over a web ReadableStream (the shape Node's
// native `fetch` returns as `response.body`). Deliberately dependency-free: we
// only need the subset of the SSE spec the hookd server emits — `event:`,
// `data:` (possibly multi-line), comment lines (`:` prefix, used for keepalive),
// and blank-line dispatch. `id:`/`retry:` are parsed but ignored.
//
// Yields `{ event, data }` objects. `event` defaults to "message" per spec when
// no event field was present in the block.

/**
 * @param {ReadableStream<Uint8Array>} stream
 * @returns {AsyncGenerator<{event: string, data: string}>}
 */
export async function* parseSSE(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event = '';
  let data = [];

  const flush = () => {
    const out = data.length || event ? { event: event || 'message', data: data.join('\n') } : null;
    event = '';
    data = [];
    return out;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);

        if (line === '') {
          const ev = flush();
          if (ev) yield ev;
          continue;
        }
        if (line[0] === ':') continue; // comment / keepalive

        const colon = line.indexOf(':');
        let field;
        let val;
        if (colon === -1) {
          field = line;
          val = '';
        } else {
          field = line.slice(0, colon);
          val = line.slice(colon + 1);
          if (val[0] === ' ') val = val.slice(1);
        }

        if (field === 'event') event = val;
        else if (field === 'data') data.push(val);
        // id / retry intentionally ignored
      }
    }
    // Stream ended; emit a trailing block if the server didn't send the final blank line.
    const ev = flush();
    if (ev) yield ev;
  } finally {
    reader.releaseLock();
  }
}
