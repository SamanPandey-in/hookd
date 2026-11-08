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
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { SkeletonRows, ErrorBanner, EmptyState } from "@/components/ui/states";

// Account activity (DESIGN §5.3, §6 + P2). A clean reverse-chronological log:
// each row is a small action glyph + a human label, the mono target, and a
// relative timestamp (useClientNow keeps it honest without reading the clock in
// render). Paginated via the `before` cursor (load-more), filterable by action
// type, and login rows surface ip/user-agent for the "was this me?" security
// view. Status trio / accent are reserved for verify + arrival, so this stays
// quiet: muted glyphs, hairline rows, no color.

const PAGE_SIZE = 50;

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
  "key.rotated": { label: "rotated api key", icon: RefreshCw },
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
  const [filter, setFilter] = React.useState<string>("all");
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState<string | null>(null);
  // When the last batch filled the page, there may be older rows to fetch.
  const [hasMore, setHasMore] = React.useState(false);
  const now = useClientNow();

  const load = React.useCallback(async () => {
    try {
      const batch = await activity.list({ limit: PAGE_SIZE });
      setList(batch);
      setHasMore(batch.length === PAGE_SIZE);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || !list || list.length === 0) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const before = list[list.length - 1].created_at_ms;
      const batch = await activity.list({ limit: PAGE_SIZE, before });
      setList((cur) => [...(cur ?? []), ...batch]);
      setHasMore(batch.length === PAGE_SIZE);
    } catch (e) {
      setMoreError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  };

  // Filter options: "all" + the distinct actions actually present in the log.
  const actionOptions = React.useMemo(() => {
    const seen = new Set<string>();
    for (const e of list ?? []) seen.add(e.action);
    return Array.from(seen).sort();
  }, [list]);

  const visible = React.useMemo(
    () => (filter === "all" ? list : (list ?? []).filter((e) => e.action === filter)),
    [list, filter],
  );

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
        <>
          {/* Action-type filter. */}
          <div className="flex items-center gap-2">
            <label htmlFor="activity-filter">
              <FieldLabel>filter</FieldLabel>
            </label>
            <select
              id="activity-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 rounded-sm border border-border bg-surface-hi px-2.5 font-mono text-xs text-text focus-visible:outline-2"
            >
              <option value="all">all actions</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {metaFor(a).label}
                </option>
              ))}
            </select>
          </div>

          <Panel className="overflow-hidden">
            {visible && visible.length > 0 ? (
              <ul className="divide-y divide-border">
                {visible.map((e) => (
                  <ActivityRow key={e.id} entry={e} now={now} />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="no matching activity"
                hint="no entries of this type in what's loaded — try another filter or load more."
              />
            )}
          </Panel>

          {moreError && (
            <p className="font-mono text-[11px]" style={{ color: "var(--fail)" }}>
              could not load more — {moreError}
            </p>
          )}

          {hasMore && (
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "loading" : "load older"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ActivityRow({ entry, now }: { entry: ActivityEntry; now: number | null }) {
  const { label, icon: Icon } = metaFor(entry.action);
  // The "was this me?" view: sign-ins (and any row carrying a captured ip) show
  // the origin ip + device.
  const showOrigin = entry.action === "login" || !!entry.ip;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-hi text-muted"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
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
        {showOrigin && (entry.ip || entry.user_agent) && (
          <span className="truncate font-mono text-[11px] text-muted">
            {entry.ip && <span title={entry.ip}>{entry.ip}</span>}
            {entry.ip && entry.user_agent && " · "}
            {entry.user_agent && (
              <span title={entry.user_agent}>{entry.user_agent}</span>
            )}
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
