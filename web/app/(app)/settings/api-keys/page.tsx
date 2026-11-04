"use client";

import * as React from "react";
import { Key, Plus, TriangleAlert } from "lucide-react";
import {
  apiKeys,
  type ApiKey,
  type CreatedApiKey,
} from "@/lib/keys";
import { API_URL, ApiError, isUpgradeRequired } from "@/lib/api";
import { relativeTime, absoluteTime } from "@/lib/utils";
import { useClientNow } from "@/lib/use-client-now";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { UpgradePrompt } from "@/components/ui/upgrade";
import { SkeletonRows, ErrorBanner, EmptyState } from "@/components/ui/states";

// API keys (DESIGN §5.3, §7, §9). A key authenticates the REST API as
// `Authorization: Bearer whk_…`. The full secret is shown exactly ONCE on
// create, then it only ever exists as a short mono `prefix…`. Revoke is a
// two-step confirm. The free plan caps keys — a 402 on create surfaces an
// inline UpgradePrompt (never a toast). Real loading / empty / error states.

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : (e as Error).message || "failed";
}

const inputCls =
  "h-9 w-full rounded-sm border border-border bg-surface-hi px-3 font-mono text-sm text-text placeholder:text-muted focus-visible:outline-2";

export default function ApiKeysPage() {
  const [list, setList] = React.useState<ApiKey[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // The one-time secret reveal — held only in memory, cleared when dismissed.
  const [revealed, setRevealed] = React.useState<CreatedApiKey | null>(null);
  const now = useClientNow();

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
          . a key is shown in full once, on creation — store it then.
        </p>
      </div>

      <CreateKey
        onCreated={(k) => {
          setRevealed(k);
          load();
        }}
      />

      {revealed && (
        <RevealPanel created={revealed} onDismiss={() => setRevealed(null)} />
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
        <KeysTable keys={list} now={now} onRevoked={load} />
      )}

      <UsageSnippet />
    </div>
  );
}

function CreateKey({ onCreated }: { onCreated: (k: CreatedApiKey) => void }) {
  const [name, setName] = React.useState("");
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
      const created = await apiKeys.create(name.trim() || "untitled key");
      setName("");
      onCreated(created);
    } catch (e2) {
      // A 402 means the free plan's key cap was hit server-side.
      if (isUpgradeRequired(e2)) setUpgrade(true);
      else setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
        <Button type="submit" variant="primary" disabled={busy}>
          <Plus className="h-4 w-4" />
          {busy ? "creating" : "create key"}
        </Button>
      </form>
      {upgrade && (
        <UpgradePrompt
          className="mt-3"
          message="you've hit the free limit for api keys — pro lifts the cap."
        />
      )}
      {err && (
        <p className="mt-3 font-mono text-xs" style={{ color: "var(--fail)" }}>
          {err}
        </p>
      )}
    </Panel>
  );
}

/** The single moment the full secret exists in the UI. Warn-tinted so it reads
 *  as "act now"; dismissing it drops the value from state for good. */
function RevealPanel({
  created,
  onDismiss,
}: {
  created: CreatedApiKey;
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
            copy your key now
          </h2>
          <p className="font-mono text-[11px] leading-relaxed text-muted">
            this is the only time the full key for{" "}
            <span className="text-text">{created.name}</span> is shown. you
            won&rsquo;t see it again — store it somewhere safe.
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

function KeysTable({
  keys,
  now,
  onRevoked,
}: {
  keys: ApiKey[];
  now: number | null;
  onRevoked: () => void;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="hidden grid-cols-[1.4fr_1.2fr_0.9fr_0.9fr_auto] gap-3 border-b border-border px-4 py-2.5 md:grid">
        {["name", "key", "created", "last used", ""].map((h, i) => (
          <FieldLabel key={i}>{h}</FieldLabel>
        ))}
      </div>
      <ul className="divide-y divide-border">
        {keys.map((k) => (
          <KeyRow key={k.id} apiKey={k} now={now} onRevoked={onRevoked} />
        ))}
      </ul>
    </Panel>
  );
}

function KeyRow({
  apiKey,
  now,
  onRevoked,
}: {
  apiKey: ApiKey;
  now: number | null;
  onRevoked: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const revoke = async () => {
    setBusy(true);
    setErr(null);
    try {
      await apiKeys.remove(apiKey.id);
      onRevoked();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <li className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1.4fr_1.2fr_0.9fr_0.9fr_auto] md:items-center md:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Key className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        <span className="truncate font-sans text-sm text-text" title={apiKey.name}>
          {apiKey.name || "untitled key"}
        </span>
      </div>

      <span className="font-mono text-xs text-muted">{apiKey.prefix}…</span>

      <span className="font-mono text-xs text-muted tabular-nums">
        {now != null ? `${relativeTime(apiKey.created_at_ms, now)} ago` : "—"}
      </span>

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

      <div className="flex items-center justify-end gap-2">
        {!confirming ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirming(true)}
          >
            revoke
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" disabled={busy} onClick={revoke}>
              {busy ? "revoking" : "yes, revoke"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              cancel
            </Button>
          </div>
        )}
      </div>

      {err && (
        <p
          className="font-mono text-[11px] md:col-span-5"
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
