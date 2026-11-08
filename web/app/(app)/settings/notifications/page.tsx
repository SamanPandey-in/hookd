"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { account, ApiError } from "@/lib/api";
import type { NotificationPreferences } from "@/lib/types";
import { useMe } from "../../layout";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { SkeletonRows, ErrorBanner } from "@/components/ui/states";
import { cn } from "@/lib/utils";

// Settings → Notifications (NEW; UX_PLAN backend-feature + §4 P2). Two things
// live here: a billing email distinct from the read-only GitHub login email
// (CAN-SPAM), and the two notification toggles. Delivery is NOT wired on the
// backend yet — these are PREFERENCE STORAGE ONLY, so the page says so plainly
// rather than implying mail will arrive. Persistent inline states, never a
// toast. The lime accent is reserved for verify-PASS, so nothing here uses it.

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : (e as Error).message || "failed";
}

const DEFAULT_PREFS: NotificationPreferences = {
  billing_email: "",
  notify_product: true,
  notify_capture_alerts: false,
};

const inputCls =
  "h-9 w-full rounded-sm border border-border bg-surface-hi px-3 font-mono text-sm text-text placeholder:text-muted focus-visible:outline-2";

export default function NotificationsPage() {
  const me = useMe();
  const [prefs, setPrefs] = React.useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setPrefs(await account.getNotifications());
      setLoadError(null);
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Any edit invalidates the "saved" confirmation (it's not a toast; it sits
  // until the next change).
  const patch = (p: Partial<NotificationPreferences>) => {
    setPrefs((cur) => ({ ...(cur ?? DEFAULT_PREFS), ...p }));
    setSaved(false);
    setSaveError(null);
  };

  const save = async () => {
    if (!prefs || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const next = await account.setNotifications({
        ...prefs,
        billing_email: prefs.billing_email.trim(),
      });
      setPrefs(next);
      setSaved(true);
    } catch (e) {
      setSaveError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const loginEmail = me?.email?.trim() || "—";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
          notifications
        </h1>
        <p className="text-sm text-muted">
          where account mail goes, and what you&rsquo;d like to hear about.
        </p>
      </div>

      {/* Honest status: nothing is delivered yet. */}
      <div
        role="note"
        className="rounded-sm border border-border bg-surface-hi px-3 py-2 font-mono text-[11px] leading-relaxed text-muted"
      >
        email delivery is coming soon — your preferences are saved now and will
        apply the moment it ships. nothing is sent yet.
      </div>

      {loadError && (
        <ErrorBanner
          message={`could not load your preferences — ${loadError}`}
          onRetry={() => {
            setLoadError(null);
            setPrefs(null);
            load();
          }}
        />
      )}

      {!loadError && prefs === null && (
        <Panel>
          <SkeletonRows rows={3} />
        </Panel>
      )}

      {!loadError && prefs !== null && (
        <>
          <Panel className="flex flex-col gap-5 p-5">
            {/* Login email (read-only, from GitHub). */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel>login email</FieldLabel>
              <p className="font-mono text-xs text-text">{loginEmail}</p>
              <p className="text-xs text-muted">
                read from github — manage it there.
              </p>
            </div>

            {/* Billing email (optional override). */}
            <div className="flex flex-col gap-1.5 border-t border-border pt-4">
              <label htmlFor="billing-email" className="block">
                <FieldLabel>billing email</FieldLabel>
              </label>
              <input
                id="billing-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={prefs.billing_email}
                onChange={(e) => patch({ billing_email: e.target.value })}
                placeholder={me?.email?.trim() || "you@example.com"}
                aria-describedby="billing-email-hint"
                className={cn(inputCls, "max-w-md")}
              />
              <p id="billing-email-hint" className="text-xs text-muted">
                where receipts and billing mail would go. leave blank to use your
                login email.
              </p>
            </div>
          </Panel>

          <Panel className="flex flex-col divide-y divide-border">
            <Toggle
              id="notify-product"
              label="product updates"
              hint="occasional notes on new features and changes. no spam."
              checked={prefs.notify_product}
              onChange={(v) => patch({ notify_product: v })}
            />
            <Toggle
              id="notify-capture-alerts"
              label="capture alerts"
              hint="a heads-up on notable captures (e.g. a failed signature)."
              checked={prefs.notify_capture_alerts}
              onChange={(v) => patch({ notify_capture_alerts: v })}
            />
          </Panel>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={saving} onClick={save}>
              {saving ? "saving" : "save preferences"}
            </Button>
            {saved && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 font-mono text-xs text-muted"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                preferences saved
              </span>
            )}
          </div>

          {saveError && (
            <ErrorBanner
              message={`could not save your preferences — ${saveError}`}
              onRetry={save}
            />
          )}
        </>
      )}
    </div>
  );
}

/** A labelled on/off switch — neutral (no lime; that's reserved for verify). */
function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="font-sans text-sm text-text">
          {label}
        </label>
        <p className="text-xs leading-relaxed text-muted">{hint}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-[80ms] focus-visible:outline-2",
          checked ? "border-muted bg-surface-hi" : "border-border bg-surface",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full transition-transform duration-[80ms]",
            checked ? "translate-x-[18px] bg-text" : "translate-x-[3px] bg-muted",
          )}
        />
      </button>
    </div>
  );
}
