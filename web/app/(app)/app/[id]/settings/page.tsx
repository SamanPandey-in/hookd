"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { endpoints as endpointsApi, ApiError, isUpgradeRequired } from "@/lib/api";
import type { Endpoint, Provider, ResponseRule } from "@/lib/types";
import { useMe } from "../../../layout";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { ProviderSelect } from "@/components/ui/provider-select";
import { ProLock, UpgradePrompt, UpgradeLink } from "@/components/ui/upgrade";
import { SkeletonRows, ErrorBanner } from "@/components/ui/states";

type Save = { busy: boolean; ok: boolean; err: string | null };
const IDLE: Save = { busy: false, ok: false, err: null };

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : (e as Error).message || "failed";
}

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const isPro = me?.plan === "pro";
  // Retention caps come from the server (plan.go) via /me, so the UI can show
  // the real ceiling instead of letting a free user set 90 and get silently
  // clamped to 7 with no signal.
  const maxRetention = me?.limits?.max_retention_days ?? (isPro ? 90 : 7);
  const proRetention = me?.limits?.pro_retention_days ?? 90;
  const [ep, setEp] = React.useState<Endpoint | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setEp(await endpointsApi.get(id));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(errMsg(e));
    }
  }, [id]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/app/${id}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-sm font-mono text-xs text-muted hover:text-text focus-visible:outline-2"
        >
          <ChevronLeft className="h-4 w-4" />
          back to inspector
        </Link>
        <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
          endpoint settings
        </h1>
      </div>

      {loadErr && (
        <ErrorBanner message={`could not load this endpoint — ${loadErr}`} onRetry={load} />
      )}
      {!loadErr && !ep && (
        <Panel>
          <SkeletonRows rows={4} />
        </Panel>
      )}

      {ep && (
        <>
          <IdentitySection ep={ep} onSaved={setEp} />
          <SecretSection ep={ep} onSaved={setEp} />
          <ResponseSection ep={ep} onSaved={setEp} locked={!isPro} />
          <RetentionSection
            ep={ep}
            onSaved={setEp}
            isPro={isPro}
            maxDays={maxRetention}
            proDays={proRetention}
          />
          <DangerSection ep={ep} />
        </>
      )}
    </div>
  );
}

function SectionShell({
  title,
  desc,
  badge,
  children,
}: {
  title: string;
  desc: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h2 className="font-sans text-sm font-semibold text-text">{title}</h2>
          {badge}
        </div>
        <p className="text-xs text-muted">{desc}</p>
      </div>
      {children}
    </Panel>
  );
}

function SaveFeedback({ save }: { save: Save }) {
  // The "saved" confirmation auto-dismisses so it can't linger as stale truth
  // after the form has drifted; the error stays until the next action.
  const [showOk, setShowOk] = React.useState(false);
  React.useEffect(() => {
    // Render guards on save.ok, so the "not ok" case needs no state write here;
    // a single setState keeps this a clean sync-to-external-event effect.
    if (!save.ok) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowOk(true);
    const t = setTimeout(() => setShowOk(false), 2500);
    return () => clearTimeout(t);
  }, [save.ok]);

  if (save.err)
    return (
      <span
        role="status"
        className="font-mono text-[11px]"
        style={{ color: "var(--fail)" }}
      >
        {save.err}
      </span>
    );
  if (save.ok && showOk)
    return (
      <span
        role="status"
        className="font-mono text-[11px]"
        style={{ color: "var(--pass)" }}
      >
        saved
      </span>
    );
  return null;
}

const input =
  "h-9 w-full rounded-sm border border-border bg-surface-hi px-3 font-mono text-sm text-text placeholder:text-muted focus-visible:outline-2";

function IdentitySection({
  ep,
  onSaved,
}: {
  ep: Endpoint;
  onSaved: (e: Endpoint) => void;
}) {
  const [name, setName] = React.useState(ep.name);
  const [provider, setProvider] = React.useState<Provider | "">(ep.provider);
  const [save, setSave] = React.useState<Save>(IDLE);
  const dirty = name !== ep.name || provider !== ep.provider;

  const submit = async () => {
    setSave({ busy: true, ok: false, err: null });
    try {
      const next = await endpointsApi.update(ep.id, { name: name.trim(), provider });
      onSaved(next);
      setSave({ busy: false, ok: true, err: null });
    } catch (e) {
      setSave({ busy: false, ok: false, err: errMsg(e) });
    }
  };

  return (
    <SectionShell
      title="identity"
      desc="the provider decides which signature scheme verifies incoming requests."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="s-name" className="block">
            <FieldLabel>Name</FieldLabel>
          </label>
          <input
            id="s-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="s-provider" className="block">
            <FieldLabel>Provider</FieldLabel>
          </label>
          <ProviderSelect id="s-provider" value={provider} onChange={setProvider} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" disabled={!dirty || save.busy} onClick={submit}>
          {save.busy ? "saving" : "save"}
        </Button>
        <SaveFeedback save={save} />
      </div>
    </SectionShell>
  );
}

function SecretSection({
  ep,
  onSaved,
}: {
  ep: Endpoint;
  onSaved: (e: Endpoint) => void;
}) {
  const [secret, setSecret] = React.useState("");
  const [save, setSave] = React.useState<Save>(IDLE);
  // Rotating or clearing a live secret breaks verification + re-signed replay,
  // so it goes through an explicit confirm rather than a single click.
  const [confirm, setConfirm] = React.useState<null | "rotate" | "clear">(null);

  const set = async () => {
    if (!secret.trim()) return;
    setConfirm(null);
    setSave({ busy: true, ok: false, err: null });
    try {
      const res = await endpointsApi.setSecret(ep.id, secret.trim());
      onSaved({ ...ep, has_secret: res.has_secret, secret_mask: res.secret_mask });
      setSecret("");
      setSave({ busy: false, ok: true, err: null });
    } catch (e) {
      setSave({ busy: false, ok: false, err: errMsg(e) });
    }
  };

  const clear = async () => {
    setConfirm(null);
    setSave({ busy: true, ok: false, err: null });
    try {
      const res = await endpointsApi.clearSecret(ep.id);
      onSaved({ ...ep, has_secret: res.has_secret, secret_mask: "" });
      setSave({ busy: false, ok: true, err: null });
    } catch (e) {
      setSave({ busy: false, ok: false, err: errMsg(e) });
    }
  };

  return (
    <SectionShell
      title="signing secret"
      desc="used to verify signatures and to re-sign on replay. stored encrypted; the full value is never shown again."
    >
      <div className="flex items-center gap-2 font-mono text-xs">
        <FieldLabel>Status</FieldLabel>
        {ep.has_secret ? (
          <span className="text-text">
            set · <span className="text-muted">{ep.secret_mask || "whsec_…"}</span>
          </span>
        ) : (
          <span className="text-muted">no secret configured</span>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="s-secret" className="block">
            <FieldLabel>{ep.has_secret ? "Rotate secret" : "Set secret"}</FieldLabel>
          </label>
          <input
            id="s-secret"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="whsec_…"
            className={input}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!secret.trim() || save.busy}
            onClick={() => (ep.has_secret ? setConfirm("rotate") : set())}
          >
            {ep.has_secret ? "rotate" : "set"}
          </Button>
          {ep.has_secret && (
            <Button
              variant="danger"
              size="sm"
              disabled={save.busy}
              onClick={() => setConfirm("clear")}
            >
              clear
            </Button>
          )}
        </div>
      </div>
      {confirm && (
        <div
          className="flex flex-col gap-2 rounded-md border px-4 py-3"
          style={{
            borderColor: "color-mix(in oklab, var(--warn) 40%, var(--border))",
            background: "color-mix(in oklab, var(--warn) 8%, transparent)",
          }}
        >
          <p className="font-mono text-xs leading-relaxed text-text">
            {confirm === "clear"
              ? "clear the signing secret? verification and re-signed replay stop working until you set a new one."
              : "rotate the signing secret? the current secret stops verifying incoming requests and existing re-signed replays break."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={save.busy}
              onClick={() => (confirm === "clear" ? clear() : set())}
            >
              {confirm === "clear" ? "yes, clear" : "yes, rotate"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={save.busy}
              onClick={() => setConfirm(null)}
            >
              cancel
            </Button>
          </div>
        </div>
      )}
      <SaveFeedback save={save} />
    </SectionShell>
  );
}

function ResponseSection({
  ep,
  onSaved,
  locked,
}: {
  ep: Endpoint;
  onSaved: (e: Endpoint) => void;
  /** Free accounts: response control is Pro-only, so the editor is shown
   *  present-but-disabled with an upgrade prompt (reacts to the plan). */
  locked: boolean;
}) {
  const [status, setStatus] = React.useState(String(ep.response.status));
  const [body, setBody] = React.useState(ep.response.body);
  const [headers, setHeaders] = React.useState<{ k: string; v: string }[]>(
    Object.entries(ep.response.headers ?? {}).map(([k, v]) => ({ k, v })),
  );
  const [save, setSave] = React.useState<Save>(IDLE);
  const [upgrade, setUpgrade] = React.useState(false);

  const setHeader = (i: number, patch: Partial<{ k: string; v: string }>) =>
    setHeaders((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  const submit = async () => {
    if (locked) return;
    const statusNum = Number(status);
    if (!Number.isInteger(statusNum) || statusNum < 100 || statusNum > 599) {
      setSave({ busy: false, ok: false, err: "status must be a code between 100 and 599" });
      return;
    }
    const headerMap: Record<string, string> = {};
    for (const h of headers) if (h.k.trim()) headerMap[h.k.trim()] = h.v;
    const rule: ResponseRule = { status: statusNum, headers: headerMap, body };
    setSave({ busy: true, ok: false, err: null });
    setUpgrade(false);
    try {
      const next = await endpointsApi.setResponseRule(ep.id, rule);
      onSaved(next);
      setSave({ busy: false, ok: true, err: null });
    } catch (e) {
      // A 402 means the plan changed since load — show the upgrade prompt.
      if (isUpgradeRequired(e)) {
        setSave(IDLE);
        setUpgrade(true);
      } else {
        setSave({ busy: false, ok: false, err: errMsg(e) });
      }
    }
  };

  return (
    <SectionShell
      title="response rule"
      desc="what this endpoint returns to the sender after it captures a request."
      badge={locked ? <ProLock /> : undefined}
    >
      {locked && (
        <UpgradePrompt message="response control — set the status, headers and body your endpoint returns, to exercise provider retries — is a pro feature." />
      )}
      {/* A disabled fieldset cascades to every control inside it. */}
      <fieldset disabled={locked} className="contents">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="s-status" className="block">
          <FieldLabel>Status code</FieldLabel>
        </label>
        <input
          id="s-status"
          inputMode="numeric"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${input} max-w-[8rem]`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Response headers</FieldLabel>
        {headers.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label="header name"
              value={h.k}
              onChange={(e) => setHeader(i, { k: e.target.value })}
              placeholder="Content-Type"
              className={`${input} flex-1`}
            />
            <input
              aria-label="header value"
              value={h.v}
              onChange={(e) => setHeader(i, { v: e.target.value })}
              placeholder="application/json"
              className={`${input} flex-1`}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="remove header"
              onClick={() => setHeaders((hs) => hs.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          onClick={() => setHeaders((hs) => [...hs, { k: "", v: "" }])}
        >
          <Plus className="h-4 w-4" />
          add header
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="s-body" className="block">
          <FieldLabel>Response body</FieldLabel>
        </label>
        <textarea
          id="s-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="{}"
          className="w-full rounded-sm border border-border bg-surface-hi px-3 py-2 font-mono text-sm text-text placeholder:text-muted focus-visible:outline-2"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" disabled={save.busy} onClick={submit}>
          {save.busy ? "saving" : "save response rule"}
        </Button>
        <SaveFeedback save={save} />
      </div>
      </fieldset>
      {upgrade && (
        <UpgradePrompt message="response control is a pro feature — the rule wasn't saved." />
      )}
    </SectionShell>
  );
}

function RetentionSection({
  ep,
  onSaved,
  isPro,
  maxDays,
  proDays,
}: {
  ep: Endpoint;
  onSaved: (e: Endpoint) => void;
  isPro: boolean;
  /** The plan's retention ceiling (free: 7, pro: 90) from /me. The server
   *  clamps to this; the UI makes the ceiling visible instead of silently
   *  swallowing a larger value. */
  maxDays: number;
  /** The Pro-tier ceiling, used only in the free upgrade tease. */
  proDays: number;
}) {
  const [days, setDays] = React.useState(String(ep.retention_days));
  const [save, setSave] = React.useState<Save>(IDLE);
  const dirty = String(ep.retention_days) !== days;
  // The user asked for more than their plan allows — the server will clamp it,
  // so say so up front rather than letting "saved" quietly mean something else.
  const overCap = Number(days) > maxDays;

  const submit = async () => {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1) {
      setSave({ busy: false, ok: false, err: "retention must be a whole number of days (1 or more)" });
      return;
    }
    setSave({ busy: true, ok: false, err: null });
    try {
      const next = await endpointsApi.update(ep.id, { retention_days: n });
      // Re-sync from the server's response: if it clamped (e.g. free asked 90,
      // got 7) the field now shows the value that actually took effect.
      onSaved(next);
      setDays(String(next.retention_days));
      setSave({ busy: false, ok: true, err: null });
    } catch (e) {
      setSave({ busy: false, ok: false, err: errMsg(e) });
    }
  };

  return (
    <SectionShell
      title="retention"
      desc="captured events older than this are purged automatically."
    >
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="s-days" className="block">
            <FieldLabel>Days</FieldLabel>
          </label>
          <input
            id="s-days"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={`${input} max-w-[8rem]`}
          />
        </div>
        <Button variant="primary" size="sm" disabled={!dirty || save.busy} onClick={submit}>
          {save.busy ? "saving" : "save"}
        </Button>
        <SaveFeedback save={save} />
      </div>

      {/* The felt wall: free sees its 7-day ceiling and what Pro extends it to;
          pro just sees its ceiling. Not a hard lock — retention is usable on
          free — so this is a quiet cap note, not a ProLock. */}
      {isPro ? (
        <p className="font-mono text-[11px] text-muted">
          your plan keeps up to {maxDays} days of history per endpoint.
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-muted">
          free keeps up to {maxDays} days — pro extends retention to {proDays}{" "}
          days. <UpgradeLink />
        </p>
      )}
      {overCap && (
        <p className="font-mono text-[11px]" style={{ color: "var(--warn)" }}>
          your plan caps retention at {maxDays} days — saving will store {maxDays}
          , not {days}.
        </p>
      )}
    </SectionShell>
  );
}

function DangerSection({ ep }: { ep: Endpoint }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  // Move focus onto the destructive confirm so a keyboard user doesn't have to
  // hunt for it (and Enter doesn't re-trigger the button that opened it).
  React.useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await endpointsApi.remove(ep.id);
      router.push("/app");
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Panel
      className="flex flex-col gap-4 p-4"
      style={{ borderColor: "color-mix(in oklab, var(--fail) 35%, var(--border))" }}
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="font-sans text-sm font-semibold text-text">delete endpoint</h2>
        <p className="text-xs text-muted">
          permanently removes this endpoint and every event captured at it. the
          ingest url stops working immediately. this cannot be undone.
        </p>
      </div>
      {!confirming ? (
        <Button variant="danger" size="sm" className="w-fit" onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" />
          delete endpoint
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-text">
            delete <span className="text-muted">{ep.name || "untitled"}</span>?
          </span>
          <Button ref={confirmRef} variant="danger" size="sm" disabled={busy} onClick={remove}>
            {busy ? "deleting" : "yes, delete"}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
            cancel
          </Button>
        </div>
      )}
      {err && (
        <p className="font-mono text-[11px]" style={{ color: "var(--fail)" }}>
          {err}
        </p>
      )}
    </Panel>
  );
}
