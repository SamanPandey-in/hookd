// Thin hookd API client. Every request authenticates with the API key via
// `Authorization: Bearer <key>` — the stream, event-detail and event-body
// routes all accept API keys (server/internal/api/api.go).
//
// API contract (base defaults to http://localhost:8099):
//   GET {api}/api/endpoints/{endpointId}/stream  -> text/event-stream
//   GET {api}/api/events/{eventId}               -> JSON event metadata
//   GET {api}/api/events/{eventId}/body          -> raw captured body bytes

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function makeClient({ api, key, fetchImpl = fetch }) {
  const base = String(api).replace(/\/+$/, '');
  const auth = { Authorization: `Bearer ${key}`, Accept: 'application/json' };

  return {
    base,
    /**
     * Open the SSE stream. Returns the Response so the caller controls the
     * ReadableStream lifecycle. Pass an AbortSignal to cancel.
     */
    async openStream(endpointId, signal) {
      const url = `${base}/api/endpoints/${encodeURIComponent(endpointId)}/stream`;
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { ...auth, Accept: 'text/event-stream' },
        signal,
      });
      if (!res.ok) {
        throw new ApiError(res.status, `stream open failed: HTTP ${res.status}`);
      }
      if (!res.body) {
        throw new ApiError(res.status, 'stream response has no body');
      }
      return res;
    },

    /** Fetch one event's JSON metadata (method, headers[], event_type, body?...). */
    async getEvent(eventId, signal) {
      const url = `${base}/api/events/${encodeURIComponent(eventId)}`;
      const res = await fetchImpl(url, { method: 'GET', headers: auth, signal });
      if (!res.ok) throw new ApiError(res.status, `event detail failed: HTTP ${res.status}`);
      return res.json();
    },

    /** Fetch one event's raw captured body as a Buffer. */
    async getEventBody(eventId, signal) {
      const url = `${base}/api/events/${encodeURIComponent(eventId)}/body`;
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: auth.Authorization },
        signal,
      });
      if (!res.ok) throw new ApiError(res.status, `event body failed: HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    },
  };
}
