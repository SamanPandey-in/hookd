"use client";

import * as React from "react";
import { share as shareApi } from "@/lib/api";
import type { EventDetail } from "@/lib/types";
import { absoluteTime, formatBytes } from "@/lib/utils";
import { LogoMark } from "@/components/ui/logo-mark";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { StatusGlyph, verifyKind } from "@/components/ui/status";
import { ErrorBanner, SkeletonRows } from "@/components/ui/states";
import { SignatureVerifyPanel } from "@/components/inspector/signature-verify-panel";
import { JSONViewer } from "@/components/inspector/json-viewer";
import { HeadersTable } from "@/components/inspector/headers-table";
import { deriveEventType } from "@/components/inspector/derive";

// Public, logged-out, read-only view of one captured event (DESIGN §5.3).
// No auth; the backend already redacts Authorization/Cookie/X-Api-Key before it
// ever leaves the server, so what renders here is safe to share. No replay, no
// attempts — this is a shareable snapshot of a single capture.
// `token` is passed from the server page (which awaits params) so this client
// component needs no useParams() — that would block prerendering under Next 16.
export function ShareView({ token }: { token: string }) {
  const [event, setEvent] = React.useState<EventDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setEvent(await shareApi.get(token));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const eventType = event ? deriveEventType(event.body, event.headers) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-mono text-xs text-muted">shared event · read-only</span>
        </div>
        <ThemeToggle />
      </header>

      {error && (
        <ErrorBanner
          message={`this shared event could not be loaded — it may have expired or the link is wrong (${error})`}
          onRetry={load}
        />
      )}

      {!error && !event && (
        <Panel>
          <SkeletonRows rows={5} />
        </Panel>
      )}

      {event && (
        <>
          <section className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <StatusGlyph
                kind={verifyKind(event.verify_status)}
                className="text-[10px]"
                title={`verify: ${event.verify_status || "unknown"}`}
              />
              <span className="font-mono text-sm font-medium text-text">{event.method}</span>
              <span className="truncate font-mono text-sm text-text" title={event.path}>
                {event.path}
                {event.query ? `?${event.query}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted">
              {eventType && <span className="text-text">{eventType}</span>}
              <span className="tabular-nums">{absoluteTime(event.received_at_ms)}</span>
              <span>{event.content_type || "no content-type"}</span>
              <span className="tabular-nums">{formatBytes(event.size)}</span>
            </div>
          </section>

          <SignatureVerifyPanel
            status={event.verify_status}
            cause={event.verify_cause}
            summary={event.verify_summary}
            details={event.verify_details}
          />

          <section className="flex flex-col gap-2">
            <FieldLabel>Body</FieldLabel>
            {event.body ? (
              <Panel className="p-2">
                <JSONViewer data={event.body} className="max-h-[55vh]" />
              </Panel>
            ) : (
              <Panel>
                <p className="px-4 py-6 font-mono text-xs text-muted">empty body</p>
              </Panel>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <FieldLabel>Headers</FieldLabel>
            <Panel className="overflow-hidden">
              <HeadersTable headers={event.headers} />
            </Panel>
            <p className="font-mono text-[11px] text-muted">
              sensitive headers (authorization, cookie, x-api-key) are redacted before sharing.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
