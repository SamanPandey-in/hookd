"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { endpoints as endpointsApi, ApiError } from "@/lib/api";
import type { Endpoint, Provider } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";
import { PROVIDER_META } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Send-a-sample control (U-2). The backend's SendSample accepts an optional
// { provider } body and only errors when BOTH the request and the endpoint
// have no provider — so for an auto-detect endpoint we must pass one. When the
// endpoint has a concrete provider we send bare (the backend uses it); when it
// is auto-detect we open a compact provider picker (default stripe) and send
// the chosen scheme. The dead "no provider set on endpoint" error is never
// surfaced for the default state — the picker replaces it.

export function SampleSender({
  endpoint,
  onSent,
  variant = "button",
  className,
}: {
  endpoint: Endpoint;
  /** Called after a sample is successfully sent. */
  onSent?: () => void;
  /** "icon" = compact paper-plane (dashboard card); "button" = labelled button
   *  (inspector empty state). */
  variant?: "icon" | "button";
  className?: string;
}) {
  const autoDetect = endpoint.provider === "";
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [provider, setProvider] = React.useState<Provider>("stripe");
  const errTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(
    () => () => {
      if (errTimer.current) clearTimeout(errTimer.current);
    },
    [],
  );

  // Dismiss the picker on an outside click or Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const fire = async (p?: Provider) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      // Concrete-provider endpoints send bare (backend uses the endpoint's
      // provider); auto-detect passes the picked provider.
      await endpointsApi.sendSample(endpoint.id, p);
      setOpen(false);
      onSent?.();
    } catch (e) {
      // Surface a transient inline note (never a toast); auto-dismiss so it
      // doesn't linger as stale.
      setErr(e instanceof ApiError ? e.message : (e as Error).message || "failed");
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErr(null), 6000);
    } finally {
      setBusy(false);
    }
  };

  const onTrigger = () => {
    if (autoDetect) setOpen((o) => !o);
    else fire();
  };

  const trigger =
    variant === "icon" ? (
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        title="send a sample event"
        aria-label="send a sample event"
        aria-expanded={autoDetect ? open : undefined}
        onClick={onTrigger}
      >
        <Send className="h-4 w-4" />
      </Button>
    ) : (
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        aria-expanded={autoDetect ? open : undefined}
        onClick={onTrigger}
      >
        {busy ? "sending…" : "send a sample event"}
      </Button>
    );

  return (
    <div
      ref={rootRef}
      className={cn("relative flex shrink-0 flex-col items-end gap-1", className)}
    >
      {trigger}

      {autoDetect && open && (
        <div
          role="group"
          aria-label="pick a provider to sign the sample"
          className="absolute right-0 top-full z-20 mt-1 flex w-60 flex-col gap-2 rounded-md border border-border bg-surface p-2.5"
        >
          <p className="font-mono text-[11px] leading-relaxed text-muted">
            auto-detect endpoint — pick a provider to sign the sample:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => {
              const active = p === provider;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => setProvider(p)}
                  className={cn(
                    "rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors duration-[80ms] cursor-pointer focus-visible:outline-2 disabled:opacity-50",
                    active
                      ? "border-border bg-surface-hi text-text"
                      : "border-border text-muted hover:text-text",
                  )}
                >
                  {PROVIDER_META[p].label}
                </button>
              );
            })}
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => fire(provider)}
          >
            {busy ? "sending…" : `send ${PROVIDER_META[provider].label} sample`}
          </Button>
        </div>
      )}

      {err && (
        <span
          role="status"
          className="max-w-[12rem] text-right font-mono text-[10px] leading-tight"
          style={{ color: "var(--fail)" }}
        >
          sample failed — {err}
        </span>
      )}
    </div>
  );
}
