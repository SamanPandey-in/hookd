"use client";

import * as React from "react";
import {
  Ban,
  CreditCard,
  Key,
  LogIn,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { activity, type ActivityAction, type ActivityEntry } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { relativeTime, absoluteTime } from "@/lib/utils";
import { useClientNow } from "@/lib/use-client-now";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows, ErrorBanner, EmptyState } from "@/components/ui/states";

// Account activity (DESIGN §5.3, §6). A clean reverse-chronological log: each
// row is a small action glyph + a human label, the mono target, and a relative
// timestamp (useClientNow keeps it honest without reading the clock in render).
// Status trio / accent are reserved for verify + arrival, so this stays quiet:
// muted glyphs, hairline rows, no color.

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : (e as Error).message || "failed";
}

/** action → human label + lucide icon. Unknown actions degrade to the raw verb
 *  and a neutral glyph rather than being dropped. */
const ACTION_META: Record<string, { label: string; icon: LucideIcon }> = {
  login: { label: "signed in", icon: LogIn },
  "endpoint.created": { label: "created endpoint", icon: Plus },
  "endpoint.deleted": { label: "deleted endpoint", icon: Trash2 },
  "secret.set": { label: "set signing secret", icon: ShieldCheck },
  "replay.sent": { label: "replayed event", icon: RefreshCw },
  "key.created": { label: "created api key", icon: Key },
  "key.revoked": { label: "revoked api key", icon: Ban },
  "plan.changed": { label: "changed plan", icon: CreditCard },
};

function metaFor(action: ActivityAction) {
  return (
    ACTION_META[action] ?? { label: action.replace(/[._]/g, " "), icon: Key }
  );
}

export default function ActivityPage() {
  const [list, setList] = React.useState<ActivityEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const now = useClientNow();

  // setState runs only after the awaited call resolves, so this is safe to call
  // from an effect (no synchronous state write in the effect body).
  const load = React.useCallback(async () => {
    try {
      setList(await activity.list(100));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
          activity
        </h1>
        <p className="text-sm text-muted">
          a running log of actions on your account — sign-ins, endpoints, keys,
          secrets, replays and plan changes. newest first.
        </p>
      </div>

      {error && (
        <ErrorBanner
          message={`could not load activity — ${error}`}
          onRetry={() => {
            setError(null);
            setList(null);
            load();
          }}
        />
      )}

      {!error && list === null && (
        <Panel>
          <SkeletonRows rows={6} />
        </Panel>
      )}

      {!error && list !== null && list.length === 0 && (
        <Panel>
          <EmptyState
            title="no activity yet"
            hint="actions you take — creating endpoints, keys and replays — show up here."
          />
        </Panel>
      )}

      {!error && list !== null && list.length > 0 && (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-border">
            {list.map((e) => (
              <ActivityRow key={e.id} entry={e} now={now} />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function ActivityRow({
  entry,
  now,
}: {
  entry: ActivityEntry;
  now: number | null;
}) {
  const { label, icon: Icon } = metaFor(entry.action);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-hi text-muted"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
        <span className="font-sans text-sm text-text">{label}</span>
        {entry.target && (
          <span
            className="truncate font-mono text-xs text-muted"
            title={entry.target}
          >
            {entry.target}
          </span>
        )}
      </div>

      <time
        className="shrink-0 font-mono text-xs text-muted tabular-nums"
        title={absoluteTime(entry.created_at_ms)}
      >
        {now != null ? relativeTime(entry.created_at_ms, now) : "—"}
      </time>
    </li>
  );
}
