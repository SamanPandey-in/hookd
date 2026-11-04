import * as React from "react";
import { cn } from "@/lib/utils";
import { FieldLabel } from "@/components/ui/panel";
import { UpgradeLink } from "@/components/ui/upgrade";
import { CAUSE_HINT, providerLabel } from "@/lib/providers";
import type { Provider, VerifyCause, VerifyStatus } from "@/lib/types";

// THE hero component (DESIGN §1, §6). Boldness is spent here and in the arrival
// pulse — nowhere else. PASS gets a lime left-rule + "✓ VERIFIED" + one-line
// WHY. FAIL gets a coral rule + "✕ FAILED" + the specific cause. It always
// explains why, driven entirely off the backend verify Result.

export interface SignatureVerifyPanelProps {
  status: VerifyStatus;
  cause: VerifyCause;
  summary: string;
  details?: Record<string, string> | null;
  provider?: Provider | "";
  /** The check draws in once on mount; pass false to render it static. */
  animate?: boolean;
  /** Free accounts: the backend omits cause/summary/details, so pass true to
   *  render a locked "why" row + upgrade link in place of the explanation. The
   *  pass/fail verdict itself (rule + headline) still shows — only the WHY is
   *  gated. Omit it for Pro, the public share view and the marketing demo, which
   *  pass the full explanation and must never show the lock. */
  lockedWhy?: boolean;
  /** Where the locked-why upgrade link points (defaults to the account page). */
  upgradeHref?: string;
  className?: string;
}

/** The checkmark SVG that draws in once (~180ms), never looping (DESIGN §7). */
function DrawnCheck({ animate }: { animate: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12.5l5 5L20 6" className={animate ? "animate-check" : ""} />
    </svg>
  );
}

export function SignatureVerifyPanel({
  status,
  cause,
  summary,
  details,
  provider,
  animate = true,
  lockedWhy = false,
  upgradeHref,
  className,
}: SignatureVerifyPanelProps) {
  const pass = status === "pass";
  const fail = status === "fail";
  // Only gate once there's an actual verdict to explain.
  const locked = lockedWhy && (pass || fail);

  const tone = pass ? "var(--pass)" : fail ? "var(--fail)" : "var(--muted)";
  const rule = pass ? "rule-pass" : fail ? "rule-fail" : "";
  const headline = pass ? "VERIFIED" : fail ? "FAILED" : "UNVERIFIED";

  // Prefer the server's precise Summary; fall back to the cause hint.
  const why =
    summary ||
    (cause && cause !== "ok" ? CAUSE_HINT[cause as Exclude<VerifyCause, "">] : "") ||
    "";

  const detailEntries = details ? Object.entries(details).filter(([, v]) => v) : [];

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface",
        rule,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <FieldLabel>Signature</FieldLabel>
        <span
          className="inline-flex items-center gap-1.5 font-mono text-sm font-medium"
          style={{ color: tone }}
        >
          {pass ? (
            <DrawnCheck animate={animate} />
          ) : (
            <span aria-hidden>{fail ? "✕" : "◦"}</span>
          )}
          {headline}
        </span>
      </div>

      {locked ? (
        <div className="flex flex-col items-start gap-1.5 px-4 pb-1 pt-1.5">
          <p className="font-mono text-xs leading-relaxed text-muted break-words">
            {pass
              ? "signature verified — upgrade to see the scheme, algorithm and which secret matched"
              : "signature failed — upgrade to see why (timestamp, secret, encoding or body mutation)"}
          </p>
          <UpgradeLink href={upgradeHref} />
        </div>
      ) : (
        why && (
          <p className="px-4 pb-1 pt-1.5 font-mono text-xs leading-relaxed text-text break-words">
            {why}
          </p>
        )
      )}

      {provider !== undefined && (
        <p className="px-4 font-mono text-[11px] text-muted">
          provider: {providerLabel(provider)}
        </p>
      )}

      {!locked && detailEntries.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 pb-3 pt-2">
          {detailEntries.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="font-mono text-[11px] text-muted">{k}</dt>
              <dd
                className="truncate font-mono text-[11px] text-text"
                title={v}
              >
                {v}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {(locked || detailEntries.length === 0) && <div className="pb-3" />}
    </div>
  );
}
