"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { auth, billing, isUnauthorized, ApiError } from "@/lib/api";
import type { Me, Subscription } from "@/lib/types";
import { isDunning, periodEndLabel } from "@/lib/billing";
import { formatDate } from "@/lib/utils";
import { CommandBar } from "@/components/shell/command-bar";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/ui/upgrade";
import { ErrorBanner, SkeletonRows } from "@/components/ui/states";

type AuthState =
  | { kind: "loading" }
  | { kind: "authed"; me: Me }
  | { kind: "error"; message: string };

const MeContext = React.createContext<Me | null>(null);
export const useMe = () => React.useContext(MeContext);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = React.useState<AuthState>({ kind: "loading" });

  // setState runs only after the awaited call resolves, so calling this from an
  // effect does not write state synchronously in the effect body.
  const load = React.useCallback(async () => {
    try {
      const me = await auth.me();
      setState({ kind: "authed", me });
    } catch (e) {
      if (isUnauthorized(e)) {
        router.replace("/login");
        return;
      }
      setState({ kind: "error", message: (e as Error).message });
    }
  }, [router]);

  React.useEffect(() => {
    // Fetch on mount. load() only writes state after awaiting /me.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Retry from the error banner: reset to loading (an event handler, not an
  // effect), then re-fetch.
  const retry = () => {
    setState({ kind: "loading" });
    load();
  };

  const logout = async () => {
    try {
      await auth.logout();
    } catch {
      /* best-effort */
    }
    router.replace("/login");
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* instrument-depth backdrop — subtle signal grid + a faint top aura, so
          the app reads as a crafted panel, not a flat admin dashboard. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="bg-signal-grid absolute inset-0 opacity-[0.22] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="aura-accent absolute left-1/2 top-[-18%] h-[360px] w-[820px] -translate-x-1/2 opacity-30" />
      </div>
      {/* The whole app shell is client + auth-gated and reads runtime-only
          values (usePathname in the command bar and settings rail), so it is
          never meaningfully static. One Suspense boundary lets those stream in
          after prerender instead of blocking the build (Next 16 Cache Components). */}
      <React.Suspense fallback={<ShellFallback />}>
      <div className="relative z-10 flex min-h-screen flex-col">
      {/* App skip-link: first focusable thing, jumps past the command bar to the
          page content. Visually hidden until focused. */}
      <a
        href="#app-main"
        className="sr-only rounded-sm border border-border bg-surface px-3 py-2 font-mono text-sm text-text focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
      >
        skip to content
      </a>
      <CommandBar
        right={
          state.kind === "authed" ? (
            <div className="flex items-center gap-2">
              <PlanBadge plan={state.me.plan === "pro" ? "pro" : "free"} />
              <span className="hidden font-mono text-xs text-muted sm:inline">
                @{state.me.login}
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                sign out
              </Button>
            </div>
          ) : null
        }
      />
      {state.kind === "authed" && (
        <DunningBanner subscription={state.me.subscription} />
      )}
      <main id="app-main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {state.kind === "loading" && (
          <SkeletonRows className="rounded-md border border-border bg-surface" />
        )}
        {state.kind === "error" && (
          <ErrorBanner
            message={`could not load your account — ${state.message}`}
            onRetry={retry}
            retryLabel="retry"
          />
        )}
        {state.kind === "authed" && (
          <MeContext.Provider value={state.me}>{children}</MeContext.Provider>
        )}
      </main>
      </div>
      </React.Suspense>
    </div>
  );
}

/** Prerender-time placeholder for the auth-gated app shell: the command-bar
 *  hairline plus a calm loading panel, matching the real layout's dimensions so
 *  there is no shift when the client shell streams in. */
function ShellFallback() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-bg/80 px-4 backdrop-blur-md" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <SkeletonRows className="rounded-md border border-border bg-surface" />
      </main>
    </div>
  );
}

/** Global dunning banner (P0-4). Persistent, non-dismissible, on every authed
 *  page. Shown only while a charge is failing (past_due / on_hold / failed) —
 *  these users still look "pro" everywhere else, so this is the one honest
 *  signal that their access is about to lapse. Coral/--warn, never lime. The
 *  button reuses the Dodo customer portal to update the payment method. */
function DunningBanner({ subscription }: { subscription: Subscription | null }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  if (!subscription || !isDunning(subscription.status)) return null;

  const due = formatDate(subscription.current_period_end);
  const dueLabel = periodEndLabel(subscription); // "retrying payment — due"

  const openPortal = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { portal_url } = await billing.portal();
      window.location.href = portal_url;
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : (e as Error).message || "failed";
      setErr(
        e instanceof ApiError && e.status === 503
          ? "billing portal isn't available on this deploy yet."
          : msg,
      );
      setBusy(false);
    }
  };

  return (
    <div
      role="alert"
      className="relative z-20 border-b"
      style={{
        borderColor: "color-mix(in oklab, var(--warn) 45%, var(--border))",
        background: "color-mix(in oklab, var(--warn) 12%, transparent)",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-mono text-xs leading-relaxed text-text">
            <span style={{ color: "var(--warn)" }}>●</span> Your last payment
            didn&rsquo;t go through — update your payment method to keep pro.
          </p>
          {due !== "—" && (
            <p className="font-mono text-[11px] text-muted tabular-nums">
              {dueLabel} {due}
            </p>
          )}
          {err && (
            <p className="font-mono text-[11px]" style={{ color: "var(--fail)" }}>
              {err}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            disabled={busy}
            onClick={openPortal}
          >
            {busy ? "opening portal" : "update payment method"}
          </Button>
          <a
            href="/support"
            className="rounded-sm font-mono text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-text focus-visible:outline-2"
          >
            contact support
          </a>
        </div>
      </div>
    </div>
  );
}
