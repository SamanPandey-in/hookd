"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { account, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { isLapsed } from "@/lib/billing";
import { asProfile, deleteAccount } from "@/lib/profile";
import { useMe } from "../../layout";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { PlanBadge, UpgradeLink } from "@/components/ui/upgrade";
import { ErrorBanner } from "@/components/ui/states";

// Settings → Profile (DESIGN §5.3). Identity comes from the shell's /api/me via
// context — no refetch. Everything reads defensively so a missing field renders
// a calm placeholder rather than blank. The danger zone deletes the whole
// account behind a type-to-confirm gate (never a one-click destructive button),
// then routes to /login. Anti-slop: one accent (reserved), hairline panels,
// mono for data, lowercase terse voice.

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : (e as Error).message || "failed";
}

/** Up to two initials from a name or login, for the avatar fallback. */
function initials(nameOrLogin: string): string {
  const parts = nameOrLogin.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfilePage() {
  const me = useMe();
  // The shell only renders children once /me resolves; guard so a direct hit
  // never throws while context settles (its own loading/error states cover the
  // fetch — here `me` is already available or null in that window).
  if (!me) return null;
  const p = asProfile(me);
  const isPro = p.plan === "pro";
  const displayName = p.name?.trim() || p.login;
  // Active billing = Pro, or a subscription that hasn't lapsed. Deletion while
  // this is true should warn the user to sort billing first (P1-17).
  const hasActiveBilling =
    isPro || (!!p.subscription && !isLapsed(p.subscription.status));

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-sans text-lg font-semibold tracking-tight text-text">
          profile
        </h2>
        <p className="text-sm text-muted">
          your account identity, read from github. managed on github — edit your
          name or avatar there.
        </p>
      </div>

      {/* Identity card */}
      <Panel className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-4">
          <Avatar url={p.avatar_url} name={displayName} login={p.login} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-sans text-lg font-semibold text-text">
                {displayName}
              </span>
              <PlanBadge plan={isPro ? "pro" : "free"} />
            </div>
            <span className="truncate font-mono text-sm text-muted">
              @{p.login}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-border pt-4">
          <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            email
          </dt>
          <dd className="min-w-0 truncate font-mono text-xs text-text">
            {p.email?.trim() || "—"}
          </dd>

          <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            member since
          </dt>
          <dd className="font-mono text-xs tabular-nums text-text">
            {p.created_at_ms ? formatDate(p.created_at_ms) : "—"}
          </dd>

          <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            connected
          </dt>
          <dd className="font-mono text-xs text-text">github</dd>
        </dl>
      </Panel>

      <PrivacyData />

      <DangerZone login={p.login} hasActiveBilling={hasActiveBilling} />
    </div>
  );
}

/** Privacy & data (GDPR). "export my data" navigates to the authenticated
 *  export URL, which the server returns as a `hookd-export.json` attachment —
 *  a plain navigation triggers the download (not a fetch). */
function PrivacyData() {
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-sans text-sm font-semibold text-text">
          privacy &amp; data
        </h2>
        <p className="text-xs leading-relaxed text-muted">
          download everything we hold for your account — your profile,
          endpoints, captured events and replays — as a single json file.
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="w-fit"
        onClick={() => {
          window.location.href = account.exportURL();
        }}
      >
        export my data
      </Button>
    </Panel>
  );
}

function Avatar({
  url,
  name,
  login,
}: {
  url: string;
  name: string;
  login: string;
}) {
  const [broken, setBroken] = React.useState(false);
  const show = url && !broken;
  const alt = `${name} (@${login})`;
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface-hi">
      {show ? (
        // next/image needs remotePatterns config this surface can't add for the
        // github avatar host, so a plain <img> keeps it self-contained.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          width={64}
          height={64}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          aria-label={alt}
          role="img"
          className="flex h-full w-full items-center justify-center font-mono text-lg font-medium text-muted"
        >
          {initials(name || login)}
        </span>
      )}
    </div>
  );
}

function DangerZone({
  login,
  hasActiveBilling,
}: {
  login: string;
  hasActiveBilling: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const confirmed = typed.trim() === login;

  const remove = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAccount();
      // Account + session are gone — leave the authed shell for /login.
      router.replace("/login");
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  const cancel = () => {
    setOpen(false);
    setTyped("");
    setErr(null);
  };

  return (
    <Panel
      className="flex flex-col gap-4 p-4"
      style={{
        borderColor: "color-mix(in oklab, var(--fail) 35%, var(--border))",
      }}
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="font-sans text-sm font-semibold text-text">
          delete account
        </h2>
        <p className="text-xs leading-relaxed text-muted">
          permanently deletes your account and every endpoint, captured event
          and replay you own. ingest urls stop working immediately. this cannot
          be undone.
        </p>
      </div>

      {hasActiveBilling && (
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-sm px-3 py-2"
          style={{
            borderColor: "color-mix(in oklab, var(--warn) 45%, var(--border))",
            background: "color-mix(in oklab, var(--warn) 8%, transparent)",
            borderWidth: 1,
          }}
        >
          <TriangleAlert
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--warn)" }}
            aria-hidden
          />
          <p className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-text">
            you have an active pro subscription. cancel billing first so you
            aren&rsquo;t charged again — deleting your account here does not
            guarantee the subscription is stopped.{" "}
            <UpgradeLink href="/settings/billing">manage billing</UpgradeLink>
          </p>
        </div>
      )}

      {!open ? (
        <Button
          variant="danger"
          size="sm"
          className="w-fit"
          onClick={() => setOpen(true)}
        >
          delete account
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <label htmlFor="confirm-delete" className="flex flex-col gap-1.5">
            <FieldLabel>
              type your username{" "}
              <span className="text-text">{login}</span> to confirm
            </FieldLabel>
            <input
              id="confirm-delete"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={login}
              aria-describedby="confirm-delete-hint"
              className="h-9 w-full max-w-xs rounded-sm border border-border bg-surface-hi px-3 font-mono text-sm text-text placeholder:text-muted focus-visible:outline-2"
            />
          </label>
          <p id="confirm-delete-hint" className="sr-only">
            enter your username exactly to enable the delete button.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={!confirmed || busy}
              onClick={remove}
            >
              {busy ? "deleting account" : "permanently delete"}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={cancel}>
              cancel
            </Button>
          </div>
        </div>
      )}

      {err && <ErrorBanner message={`could not delete your account — ${err}`} onRetry={remove} />}
    </Panel>
  );
}
