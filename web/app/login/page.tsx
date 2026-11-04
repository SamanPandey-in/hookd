"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { auth, githubLoginURL, isUnauthorized } from "@/lib/api";
import { LogoMark } from "@/components/ui/logo-mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ErrorBanner } from "@/components/ui/states";

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = React.useState(true);
  const [netError, setNetError] = React.useState<string | null>(null);

  // If a session already exists, skip straight to the app. setState happens
  // only after the awaited call, so this is effect-safe.
  const check = React.useCallback(async () => {
    try {
      await auth.me();
      // Honour a ?next=/path hop (e.g. the pricing Pro CTA sends logged-out
      // visitors to /login?next=/account). Internal paths only.
      const raw =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/app";
      router.replace(next);
    } catch (e) {
      if (!isUnauthorized(e)) setNetError((e as Error).message);
      setChecking(false);
    }
  }, [router]);

  React.useEffect(() => {
    // Check the session on mount. check() only writes state after awaiting /me.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
  }, [check]);

  const retry = () => {
    setChecking(true);
    setNetError(null);
    check();
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-3">
          <LogoMark />
          <h1 className="font-sans text-2xl font-semibold leading-tight tracking-tight text-text">
            see every webhook.
            <br />
            verify every signature.
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            capture, inspect, replay and signature-verify webhooks from stripe,
            razorpay, github and more.
          </p>
        </div>

        {netError && (
          <ErrorBanner
            message={`could not reach the api — ${netError}`}
            onRetry={retry}
          />
        )}

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            disabled={checking}
            onClick={() => {
              window.location.href = githubLoginURL();
            }}
          >
            <GithubMark />
            {checking ? "checking session" : "continue with github"}
          </Button>
          <p className="text-center font-mono text-[11px] text-muted">
            no card. point a webhook and watch.
          </p>
        </div>
      </div>
    </div>
  );
}
