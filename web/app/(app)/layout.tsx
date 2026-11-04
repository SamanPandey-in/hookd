"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { auth, isUnauthorized } from "@/lib/api";
import type { Me } from "@/lib/types";
import { CommandBar } from "@/components/shell/command-bar";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/ui/upgrade";
import { ErrorBanner } from "@/components/ui/states";

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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {state.kind === "loading" && (
          <div className="h-40 animate-pulse rounded-md border border-border bg-surface" />
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
        <div className="h-40 animate-pulse rounded-md border border-border bg-surface" />
      </main>
    </div>
  );
}
