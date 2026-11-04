"use client";

import { useEffect, useRef, useState } from "react";
import { endpoints } from "./api";
import type { StreamEvent } from "./types";

export type StreamStatus = "idle" | "connecting" | "open" | "error";

export interface UseEventStreamResult {
  /** Live-captured events for this session, newest first. */
  events: StreamEvent[];
  status: StreamStatus;
  /** The most recent event id, so a view can trigger the arrival pulse once. */
  lastEventId: string | null;
  /** Drop the accumulated buffer (e.g. when switching endpoints). */
  clear: () => void;
}

export interface UseEventStreamOptions {
  /** Called once per arriving event, before it is added to the buffer. */
  onEvent?: (ev: StreamEvent) => void;
  /** Cap the in-memory buffer (default 200). */
  max?: number;
  /** Pass false to hold the connection closed. */
  enabled?: boolean;
}

/**
 * Subscribes to GET /api/endpoints/{id}/stream (Server-Sent Events) and
 * accumulates each captured webhook as it lands. The connection carries the
 * session cookie via EventSource `withCredentials`, so the backend's CORS
 * origin must match the app origin (it defaults to http://localhost:3000).
 *
 * The browser's EventSource auto-reconnects on transport drops; we surface the
 * transition as `status: "error"` then back to "open".
 */
export function useEventStream(
  endpointId: string | null | undefined,
  opts: UseEventStreamOptions = {},
): UseEventStreamResult {
  const { onEvent, max = 200, enabled = true } = opts;
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  // Keep the latest callback without reconnecting when its identity changes.
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    // This effect subscribes to an external system (EventSource) and syncs the
    // connection status back into React via its lifecycle — the intended use of
    // setState in an effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!endpointId || !enabled) {
      setStatus("idle");
      return;
    }
    setStatus("connecting");

    const es = new EventSource(endpoints.streamURL(endpointId), {
      withCredentials: true,
    });

    es.onopen = () => setStatus("open");
    es.onerror = () => {
      // EventSource reconnects on its own; reflect the blip without tearing down.
      setStatus((s) => (s === "open" ? "error" : "connecting"));
    };

    const handle = (e: MessageEvent) => {
      let parsed: StreamEvent;
      try {
        parsed = JSON.parse(e.data) as StreamEvent;
      } catch {
        return;
      }
      onEventRef.current?.(parsed);
      setLastEventId(parsed.id);
      setEvents((prev) => [parsed, ...prev].slice(0, max));
    };

    // The server emits named "event" messages (see api/stream.go).
    es.addEventListener("event", handle as EventListener);

    return () => {
      es.removeEventListener("event", handle as EventListener);
      es.close();
      setStatus("idle");
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [endpointId, enabled, max]);

  return {
    events,
    status,
    lastEventId,
    clear: () => {
      setEvents([]);
      setLastEventId(null);
    },
  };
}
