import * as React from "react";
import { cn, absoluteTime } from "@/lib/utils";
import { StatusCode, StatusBadge } from "@/components/ui/status";
import type { ReplayAttempt } from "@/lib/types";

// Attempts timeline (DESIGN §6): each replay shows response code + latency +
// timestamp + a re-signed badge, and the delivery error when it was blocked or
// failed (the SSRF guard records blocked attempts too).
export function AttemptsTimeline({
  attempts,
  className,
}: {
  attempts: ReplayAttempt[];
  className?: string;
}) {
  if (attempts.length === 0) {
    return (
      <p className={cn("px-4 py-6 font-mono text-xs text-muted", className)}>
        no replays yet
      </p>
    );
  }
  return (
    <ol className={cn("flex flex-col", className)}>
      {attempts.map((a) => {
        const blocked = !!a.error;
        return (
          <li
            key={a.id}
            className="relative flex gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            {/* timeline spine */}
            <span
              aria-hidden
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: blocked ? "var(--fail)" : "var(--pass)" }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {blocked ? (
                  <StatusBadge kind="fail">blocked</StatusBadge>
                ) : (
                  <StatusCode code={a.response_status} />
                )}
                {!blocked && (
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {a.latency_ms}ms
                  </span>
                )}
                {a.resigned && <StatusBadge kind="warn">re-signed</StatusBadge>}
                <span className="ml-auto font-mono text-[11px] text-muted tabular-nums">
                  {absoluteTime(new Date(a.created_at).getTime())}
                </span>
              </div>
              <div className="truncate font-mono text-[11px] text-muted" title={a.target_url}>
                {a.target_url}
              </div>
              {blocked && (
                <p
                  className="font-mono text-[11px] leading-relaxed break-words"
                  style={{ color: "var(--fail)" }}
                >
                  {a.error}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
