"use client";

import * as React from "react";
import { Check, Key, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import {
  apiKeys,
  maxApiKeys,
  type ApiKey,
  type CreatedApiKey,
} from "@/lib/keys";
import { API_URL, ApiError, isUpgradeRequired } from "@/lib/api";
import { relativeTime, absoluteTime, formatDate } from "@/lib/utils";
import { useClientNow } from "@/lib/use-client-now";
import { useMe } from "../../layout";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { UpgradePrompt } from "@/components/ui/upgrade";
import { SkeletonRows, ErrorBanner, EmptyState } from "@/components/ui/states";

// API keys (DESIGN §5.3, §7, §9 + P1-23). A key authenticates the REST API as
// `Authorization: Bearer whk_…`. The full secret is shown exactly ONCE on create
// OR rotate, then it only ever exists as a short mono `prefix…`. Revoke and
// rotate are two-step confirms. The plan caps keys: usage is surfaced
// proactively as "used / limit" (cap mirrored from the backend in lib/keys, as
// it is not on /me.limits) and a create past the cap surfaces an inline
// UpgradePrompt (the 402 wall), never a toast. Real loading / empty / error
// states throughout. Secret values are never logged or echoed.

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : (e as Error).message || "failed";
}

const inputCls =
  "h-9 w-full rounded-sm border border-border bg-surface-hi px-3 font-mono text-sm text-text placeholder:text-muted focus-visible:outline-2";

/** Create-form expiry choices → epoch-ms (or undefined for "never"). */
const EXPIRY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: "never", label: "never expires", days: null },
  { value: "30d", label: "in 30 days", days: 30 },
  { value: "90d", label: "in 90 days", days: 90 },
];

function expiresAtMsFor(choice: string): number | undefined {
  const opt = EXPIRY_OPTIONS.find((o) => o.value === choice);
  if (!opt || opt.days == null) return undefined;
  return Date.now() + opt.days * 86_400_000;
}

/** Is this key past its expiry? (Backend rejects expired keys with 401.) */
function isExpired(k: ApiKey, now: number | null): boolean {
  if (k.expires_at_ms == null) return false;
  return (now ?? Date.now()) >= k.expires_at_ms;
}

/** A short label for a key's scopes. An empty array means full access (both),
 *  which is how keys issued before scopes existed behave. */
function scopeLabel(scopes: string[] | undefined): string {
  if (!scopes || scopes.length === 0) return "read + write";
  const has = (s: string) => scopes.includes(s);
  if (has("read") && has("write")) return "read + write";
  if (has("write")) return "write";
  if (has("read")) return "read-only";
  return scopes.join(", ");
}

export default function ApiKeysPage() {
  const me = useMe();
  const [list, setList] = React.useState<ApiKey[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // The one-time secret reveal — held only in memory, cleared when dismissed.
  const [revealed, setRevealed] = React.useState<CreatedApiKey | null>(null);
  const [rotated, setRotated] = React.useState(false);
  // A brief post-revoke confirmation (the row otherwise just vanishes).
  const [revokedNotice, setRevokedNotice] = React.useState<string | null>(null);
  const now = useClientNow();

  const plan = me?.plan === "pro" ? "pro" : "free";
  const cap = maxApiKeys(plan);
  const proCap = maxApiKeys("pro");
  const used = list?.length ?? 0;
  const atCap = list !== null && used >= cap;

  // setState runs only after the awaited call resolves — safe from an effect.
  const load = React.useCallback(async () => {
    try {
      setList(await apiKeys.list());
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
          api keys
        </h1>
        <p className="text-sm text-muted">
          authenticate the rest api as{" "}
          <span className="font-mono text-xs text-text">
            Authorization: Bearer whk_…
          </span>
          . a key is shown in full once, on creation or rotation — store it then.
        </p>
        {/* Proactive "used / limit" so the cap is never a surprise 402. */}
        <p className="font-mono text-xs text-muted tabular-nums">
          {list === null ? (
            "—"
          ) : (
            <>
              {used} / {cap} keys used
              {atCap && plan === "free" && (
                <span className="text-text"> · at your plan limit</span>
              )}
            </>
          )}
        </p>
      </div>

      <CreateKey
        atCap={atCap}
        cap={cap}
        proCap={proCap}
        plan={plan}
        onCreated={(k) => {
          setRevealed(k);
          setRotated(false);
          setRevokedNotice(null);
          load();
        }}
      />

      {revealed && (
        <RevealPanel
          created={revealed}
          rotated={rotated}
          onDismiss={() => setRevealed(null)}
        />
      )}

      {revokedNotice && (
        <RevokedNotice name={revokedNotice} onDismiss={() => setRevokedNotice(null)} />
      )}

      {error && (
        <ErrorBanner
          message={`could not load keys — ${error}`}
          onRetry={() => {
            setError(null);
            setList(null);
            load();
          }}
        />
      )}

      {!error && list === null && (
        <Panel>
          <SkeletonRows rows={3} />
        </Panel>
      )}

      {!error && list !== null && list.length === 0 && (
        <Panel>
          <EmptyState
            title="no api keys yet"
            hint="create a key above to call the api from scripts or ci."
          />
        </Panel>
      )}

      {!error && list !== null && list.length > 0 && (
        <KeysTable
          keys={list}
          now={now}
          onRevoked={(name) => {
            setRevokedNotice(name);
            setRevealed(null);
            load();
          }}
          onRotated={(k) => {
            setRevealed(k);
            setRotated(true);
            setRevokedNotice(null);
            load();
          }}
        />
      )}

      <UsageSnippet />
    </div>
  );
}

function CreateKey({
  atCap,
  cap,
  proCap,
  plan,
  onCreated,
}: {
  atCap: boolean;
  cap: number;
  proCap: number;
  plan: "free" | "pro";
  onCreated: (k: CreatedApiKey) => void;
}) {
  const [name, setName] = React.useState("");
  const [expiry, setExpiry] = React.useState("never");
  const [readOnly, setReadOnly] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [upgrade, setUpgrade] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    setUpgrade(false);
    try {
      const created = await apiKeys.create(name.trim() || "untitled key", {
        expiresAtMs: expiresAtMsFor(expiry),
        // read-only => narrow to ["read"]; otherwise omit for full (read+write).
        scopes: readOnly ? ["read"] : undefined,
      });
      setName("");
      setExpiry("never");
      setReadOnly(false);
      onCreated(created);
    } catch (e2) {
      // A 402 means the plan's key cap was hit server-side — show the upgrade
      // prompt rather than a raw error (same wall as the endpoints dashboard).
      if (isUpgradeRequired(e2)) setUpgrade(true);
      else setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  const capMessage =
    plan === "free"
      ? `you've reached the free limit of ${cap} api key${cap === 1 ? "" : "s"} — pro lifts it to ${proCap}.`
      : `you've reached the maximum of ${cap} api keys — revoke one to create another.`;

  return (
    <Panel className="p-4">
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="key-name" className="block">
            <FieldLabel>Name</FieldLabel>
          </label>
          <input
            id="key-name"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            placeholder="ci deploy (prod)"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor="key-expiry" className="block">
            <FieldLabel>Expiry</FieldLabel>
          </label>
          <select
            id="key-expiry"
            value={expiry}
            onChange={(ev) => setExpiry(ev.target.value)}
            className="h-9 w-full rounded-sm border border-border bg-surface-hi px-3 font-mono text-sm text-text focus-visible:outline-2"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" disabled={busy || atCap}>
          <Plus className="h-4 w-4" />
          {busy ? "creating" : "create key"}
        </Button>
      </form>
      {/* Scope choice: default is full (read + write); the toggle narrows to a
          read-only key that can list/read but never mutate. */}
      <label className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted">
        <input
          type="checkbox"
          checked={readOnly}
          onChange={(ev) => setReadOnly(ev.target.checked)}
          className="h-3.5 w-3.5 rounded-sm border border-border bg-surface-hi accent-[var(--accent)] focus-visible:outline-2"
        />
        <span>
          read-only key{" "}
          <span className="text-text">
            ({readOnly ? "read" : "read + write"})
          </span>{" "}
          — a read-only key can list and read but never create, replay, or change
          anything.
        </span>
      </label>
      {(upgrade || atCap) &&
        (plan === "pro" ? (
          // A Pro account is already on the top tier — show the cap plainly, not
          // a dead "upgrade to pro" link back to billing.
          <p className="mt-3 rounded-sm border border-border bg-surface-hi px-3 py-2 font-mono text-[11px] leading-relaxed text-text">
            {capMessage}
          </p>
        ) : (
          <UpgradePrompt className="mt-3" message={capMessage} />
        ))}
      {err && (
        <p className="mt-3 font-mono text-xs" style={{ color: "var(--fail)" }}>
          {err}
        </p>
      )}
    </Panel>
  );
}

/** The single moment a full secret exists in the UI (create OR rotate).
 *  Warn-tinted so it reads as "act now"; dismissing it drops the value from
 *  state for good. Never logged or echoed anywhere else. */
function RevealPanel({
  created,
  rotated,
  onDismiss,
}: {
  created: CreatedApiKey;
  rotated: boolean;
  onDismiss: () => void;
}) {
  return (
    <Panel
      className="flex flex-col gap-3 p-4"
      style={{
        borderColor: "color-mix(in oklab, var(--warn) 45%, var(--border))",
        background: "color-mix(in oklab, var(--warn) 7%, transparent)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <TriangleAlert
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: "var(--warn)" }}
          aria-hidden
        />
        <div className="flex flex-col gap-0.5">
          <h2 className="font-sans text-sm font-semibold text-text">
            {rotated ? "copy your new key now" : "copy your key now"}
          </h2>
          <p className="font-mono text-[11px] leading-relaxed text-muted">
            {rotated ? (
              <>
                the old secret for{" "}
                <span className="text-text">{created.name}</span> stopped working
                immediately. this is the only time the new key is shown — store
                it somewhere safe.
              </>
            ) : (
              <>
                this is the only time the full key for{" "}
                <span className="text-text">{created.name}</span> is shown. you
                won&rsquo;t see it again — store it somewhere safe.
              </>
            )}
          </p>
        </div>
      </div>
      <CopyField value={created.key} label="copy api key" />
      <Button variant="secondary" size="sm" className="w-fit" onClick={onDismiss}>
        i&rsquo;ve stored it
      </Button>
    </Panel>
  );
}

/** A brief, persistent (non-toast) confirmation that a key was revoked. */
function RevokedNotice({
  name,
  onDismiss,
}: {
  name: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-sm border border-border bg-surface-hi px-3 py-2"
    >
      <Check className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-text">
        revoked <span className="text-muted">{name}</span> — it can no longer
        authenticate.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-sm font-mono text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-text focus-visible:outline-2"
      >
        dismiss
      </button>
    </div>
  );
}

function KeysTable({
  keys,
  now,
  onRevoked,
  onRotated,
}: {
  keys: ApiKey[];
  now: number | null;
  onRevoked: (name: string) => void;
  onRotated: (k: CreatedApiKey) => void;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="hidden grid-cols-[1.3fr_1fr_0.8fr_0.9fr_1.1fr_auto] gap-3 border-b border-border px-4 py-2.5 md:grid">
        {["name", "key", "created", "expires", "last used", ""].map((h, i) => (
          <FieldLabel key={i}>{h}</FieldLabel>
        ))}
      </div>
      <ul className="divide-y divide-border">
        {keys.map((k) => (
          <KeyRow
            key={k.id}
            apiKey={k}
            now={now}
            onRevoked={onRevoked}
            onRotated={onRotated}
          />
        ))}
      </ul>
    </Panel>
  );
}

function KeyRow({
  apiKey,
  now,
  onRevoked,
  onRotated,
}: {
  apiKey: ApiKey;
  now: number | null;
  onRevoked: (name: string) => void;
  onRotated: (k: CreatedApiKey) => void;
}) {
  const [mode, setMode] = React.useState<"idle" | "revoke" | "rotate">("idle");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const expired = isExpired(apiKey, now);
  const name = apiKey.name || "untitled key";

  const revoke = async () => {
    setBusy(true);
    setErr(null);
    try {
      await apiKeys.remove(apiKey.id);
      onRevoked(name);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  const rotate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const created = await apiKeys.rotate(apiKey.id);
      // Rotation keeps the same key id, so this row stays mounted (unlike
      // revoke, which unmounts it) — reset its state or it's stuck showing the
      // disabled "rotating" confirm UI until a reload.
      setMode("idle");
      setBusy(false);
      onRotated(created);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <li className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1.3fr_1fr_0.8fr_0.9fr_1.1fr_auto] md:items-center md:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Key className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        <span className="truncate font-sans text-sm text-text" title={name}>
          {name}
        </span>
        <span
          className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-muted"
          title={`scopes: ${scopeLabel(apiKey.scopes)}`}
        >
          {scopeLabel(apiKey.scopes)}
        </span>
        {expired && (
          <span
            className="shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none"
            style={{
              color: "var(--warn)",
              background: "color-mix(in oklab, var(--warn) 14%, transparent)",
            }}
          >
            expired
          </span>
        )}
      </div>

      <span className="font-mono text-xs text-muted">{apiKey.prefix}…</span>

      <span className="font-mono text-xs text-muted tabular-nums">
        {now != null ? `${relativeTime(apiKey.created_at_ms, now)} ago` : "—"}
      </span>

      <span
        className="font-mono text-xs tabular-nums"
        style={{ color: expired ? "var(--warn)" : "var(--muted)" }}
        title={
          apiKey.expires_at_ms != null
            ? absoluteTime(apiKey.expires_at_ms)
            : undefined
        }
      >
        {apiKey.expires_at_ms == null ? "never" : formatDate(apiKey.expires_at_ms)}
      </span>

      <div className="flex min-w-0 flex-col">
        <span
          className="font-mono text-xs text-muted tabular-nums"
          title={
            apiKey.last_used_at_ms != null
              ? absoluteTime(apiKey.last_used_at_ms)
              : undefined
          }
        >
          {apiKey.last_used_at_ms == null
            ? "never"
            : now != null
              ? `${relativeTime(apiKey.last_used_at_ms, now)} ago`
              : "—"}
        </span>
        {apiKey.last_used_ip && (
          <span className="truncate font-mono text-[11px] text-muted" title={apiKey.last_used_ip}>
            from {apiKey.last_used_ip}
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {mode === "idle" && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMode("rotate")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              rotate
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setMode("revoke")}
            >
              revoke
            </Button>
          </>
        )}
        {mode === "revoke" && (
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" disabled={busy} onClick={revoke}>
              {busy ? "revoking" : "yes, revoke"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setMode("idle")}
            >
              cancel
            </Button>
          </div>
        )}
        {mode === "rotate" && (
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={rotate}>
              {busy ? "rotating" : "yes, rotate"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setMode("idle")}
            >
              cancel
            </Button>
          </div>
        )}
      </div>

      {mode === "rotate" && !busy && (
        <p className="font-mono text-[11px] text-muted md:col-span-6">
          rotating reveals a new secret once and stops the current one working
          immediately.
        </p>
      )}

      {err && (
        <p
          className="font-mono text-[11px] md:col-span-6"
          style={{ color: "var(--fail)" }}
        >
          {err}
        </p>
      )}
    </li>
  );
}

function UsageSnippet() {
  const curl = `curl ${API_URL}/api/endpoints \\
  -H "Authorization: Bearer whk_your_key_here"`;
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-sans text-sm font-semibold text-text">using a key</h2>
        <p className="text-xs text-muted">
          send the key as a bearer token (or{" "}
          <span className="font-mono text-[11px] text-text">X-API-Key</span>) on
          any api route — list endpoints, read their events, fetch a single
          event.
        </p>
      </div>
      <pre className="overflow-x-auto rounded-sm border border-border bg-surface-hi p-3 font-mono text-xs leading-relaxed text-text">
        <code>{curl}</code>
      </pre>
      <CopyField value={curl} label="copy curl" />
    </Panel>
  );
}
