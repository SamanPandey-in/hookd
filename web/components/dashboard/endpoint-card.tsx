import * as React from "react";
import Link from "next/link";
import type { Endpoint } from "@/lib/types";
import { providerLabel } from "@/lib/providers";
import { relativeTime } from "@/lib/utils";
import { CopyField } from "@/components/ui/copy-field";
import { FieldLabel } from "@/components/ui/panel";

/** Per-endpoint summary stats computed on the dashboard (see page.tsx).
 *  passRate is 0..1 over verified events, null when nothing was verified. */
export interface EndpointStats {
  count: number;
  capped: boolean;
  lastMS: number | null;
  passRate: number | null;
}

/** The live listening dot — every endpoint is always ingesting, so it always
 *  pulses lime (the one accent, reserved for live + pass-rate + primary). The
 *  pulse is disabled under prefers-reduced-motion via .animate-live. */
function LivePulseDot() {
  return (
    <span
      aria-label="live"
      title="listening for events"
      className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center"
    >
      <span
        aria-hidden
        className="animate-live inline-block h-2 w-2 rounded-full"
        style={{ background: "var(--accent)" }}
      />
    </span>
  );
}

/** A hairline, graphite chip — provider label / secret indicator. Never accent. */
function Chip({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted"
    >
      {children}
    </span>
  );
}

/** One mono stat: a small field label stacked over the value. */
function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <span className="font-mono text-sm text-text tabular-nums leading-none">
        {children}
      </span>
    </div>
  );
}

/** Pass-rate as a thin horizontal meter filled lime, with the % in mono.
 *  null (nothing verified yet) renders a muted em-dash instead of a bar. */
export function PassRateMeter({ passRate }: { passRate: number | null }) {
  if (passRate === null) {
    return (
      <div className="flex flex-col gap-1">
        <FieldLabel>pass-rate</FieldLabel>
        <span className="font-mono text-sm text-muted leading-none">—</span>
      </div>
    );
  }
  const pct = Math.round(passRate * 100);
  return (
    <div className="flex min-w-[7rem] flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>pass-rate</FieldLabel>
        <span className="font-mono text-xs text-text tabular-nums leading-none">
          {pct}%
        </span>
      </div>
      <div
        role="meter"
        aria-label="signature pass-rate"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-sm bg-surface-hi"
      >
        <div
          className="h-full rounded-sm transition-[width] duration-[180ms] ease-out"
          style={{ width: `${pct}%`, background: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

/** A single endpoint rendered as an instrument/port: a crafted row on desktop,
 *  a stacked card on mobile (no horizontal scroll at 390px). The send-sample
 *  action is passed in so the data-fetching stays in the page. */
export function EndpointCard({
  endpoint: ep,
  stats: s,
  now,
  ingestUrl,
  action,
}: {
  endpoint: Endpoint;
  stats?: EndpointStats;
  now: number | null;
  /** Full ingest URL for this endpoint (page derives it via ingestURL()). */
  ingestUrl: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-4 px-4 py-4">
      {/* identity line: live dot · name · provider · secret · action */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <LivePulseDot />
          <Link
            href={`/app/${ep.id}`}
            title={ep.name || "untitled"}
            className="min-w-0 max-w-full truncate rounded-sm font-sans text-sm font-semibold text-text hover:text-accent focus-visible:outline-2"
          >
            {ep.name || "untitled"}
          </Link>
          <Chip title={ep.provider ? undefined : "signature auto-detected"}>
            {providerLabel(ep.provider)}
          </Chip>
          {ep.has_secret && (
            <Chip title="signing secret configured">
              secret {ep.secret_mask}
            </Chip>
          )}
        </div>
        {action}
      </div>

      {/* hero datum: the ingest URL a dev copies */}
      <CopyField
        value={ingestUrl}
        display={`/i/${ep.id}`}
        label="copy ingest url"
      />

      {/* instrument readout: counts + last received + pass-rate meter */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Stat label="events">{s ? `${s.count}${s.capped ? "+" : ""}` : "—"}</Stat>
        <Stat label="last received">
          {s?.lastMS && now != null ? relativeTime(s.lastMS, now) : "—"}
        </Stat>
        <div className="min-w-[7rem] flex-1">
          <PassRateMeter passRate={s ? s.passRate : null} />
        </div>
      </div>
    </li>
  );
}
