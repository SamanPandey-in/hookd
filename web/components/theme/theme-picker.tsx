"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { account, ApiError } from "@/lib/api";
import {
  THEMES,
  SYSTEM_THEME,
  SYSTEM_THEME_ID,
  isThemeChoice,
  type ThemeMeta,
  type SystemThemeMeta,
} from "@/lib/theme";
import { useMe } from "@/app/(app)/layout";

/**
 * The appearance picker: a responsive grid of preview cards, one per theme.
 *
 * Each card is a mini mockup painted with that theme's *real* colors (inline
 * styles from the swatch in lib/theme.ts — not CSS vars, since every card shows
 * a different theme than the one currently applied). Clicking a card calls
 * next-themes `setTheme(id)`, which re-skins the whole app instantly and
 * persists to localStorage (instant, per-browser).
 *
 * Account sync: the choice is ALSO persisted to the account via
 * `account.setTheme`, so it follows the user across devices. On mount we read
 * `me.theme` (the server-side preference) and apply it once if it differs from
 * what next-themes resolved — so a device with no local override picks up the
 * account's theme. Local apply stays instant; the sync is best-effort and
 * surfaced inline (never a toast) if it fails.
 *
 * The first card is "system" (follow-OS): next-themes resolves it live to the
 * two brand themes (hookd / hookd-light) via `enableSystem` on the shared
 * ThemeProvider. It persists as the string "system" in both localStorage and
 * the account, exactly like any other choice.
 *
 * Selection highlight is gated on `mounted` to avoid a hydration mismatch
 * (the resolved theme is unknown on the server).
 */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const me = useMe();
  const [mounted, setMounted] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const appliedServerTheme = React.useRef(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  // Apply the account's saved theme once, if this browser resolved to something
  // else (e.g. a fresh device with an empty localStorage). The server is the
  // source of truth across devices; this does not re-persist, so no loop.
  React.useEffect(() => {
    if (!mounted || appliedServerTheme.current) return;
    appliedServerTheme.current = true;
    const serverTheme = me?.theme?.trim();
    // Honor any applyable choice — the 8 ids OR the "system" sentinel.
    if (serverTheme && isThemeChoice(serverTheme) && serverTheme !== theme) {
      setTheme(serverTheme);
    }
  }, [mounted, me?.theme, theme, setTheme]);

  const select = (id: string) => {
    setTheme(id); // instant local apply + localStorage
    setSyncError(null);
    // Best-effort account sync so the choice follows across devices.
    account.setTheme(id).catch((e: unknown) => {
      setSyncError(
        e instanceof ApiError ? e.message : (e as Error).message || "failed",
      );
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="dashboard theme"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {/* Follow-OS choice leads the grid — the smart default that tracks the
            system between the two brand themes. */}
        <SystemThemeCard
          theme={SYSTEM_THEME}
          selected={mounted && theme === SYSTEM_THEME_ID}
          onSelect={() => select(SYSTEM_THEME_ID)}
        />
        {THEMES.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            selected={mounted && theme === t.id}
            onSelect={() => select(t.id)}
          />
        ))}
      </div>
      {syncError && (
        <p role="status" className="font-mono text-[11px] text-muted">
          saved on this device, but couldn&rsquo;t sync to your account —{" "}
          {syncError}
        </p>
      )}
    </div>
  );
}

function ThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: ThemeMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  const s = theme.swatch;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border text-left",
        "transition-colors duration-[80ms] focus-visible:outline-2",
        selected
          ? "border-accent ring-2 ring-accent"
          : "border-border hover:border-muted",
      )}
    >
      {/* selected check */}
      {selected && (
        <span
          aria-hidden
          className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-accent-fill text-on-accent"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      )}

      {/* mini mockup — painted in the theme's own colors */}
      <div className="p-3" style={{ backgroundColor: s.bg }}>
        {/* faux stream rows */}
        <div
          className="rounded-sm border"
          style={{ backgroundColor: s.surface, borderColor: s.border }}
        >
          <MockRow
            s={s}
            glyph={s.pass}
            event="charge.succeeded"
            code="200"
            codeColor={s.pass}
          />
          <div className="h-px" style={{ backgroundColor: s.border }} />
          <MockRow
            s={s}
            glyph={s.fail}
            event="invoice.payment_failed"
            code="401"
            codeColor={s.fail}
          />
        </div>

        {/* faux signature chip + accent button */}
        <div className="mt-2.5 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[11px]"
            style={{
              color: s.pass,
              backgroundColor: hexA(s.pass, 0.16),
            }}
          >
            <span aria-hidden>{"✓"}</span> verified
          </span>
          <span
            className="rounded-sm px-2 py-0.5 font-sans text-[11px] font-semibold"
            style={{ backgroundColor: s.accent, color: s.onAccent }}
          >
            Replay
          </span>
        </div>

        {/* token swatches */}
        <div className="mt-2.5 flex items-center gap-1.5">
          {[
            { c: s.bg, t: "bg" },
            { c: s.surface, t: "surface" },
            { c: s.surfaceHi, t: "surface-hi" },
            { c: s.accent, t: "accent" },
            { c: s.text, t: "text" },
          ].map((sw) => (
            <span
              key={sw.t}
              title={sw.t}
              className="h-4 w-4 rounded-full border"
              style={{ backgroundColor: sw.c, borderColor: s.border }}
            />
          ))}
        </div>
      </div>

      {/* label footer — in app chrome, not the theme's colors */}
      <div className="flex items-center justify-between gap-2 border-t border-border bg-surface px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-sans text-sm font-semibold text-text">
              {theme.label}
            </span>
            {theme.isDefault && (
              <span className="rounded-sm border border-border px-1 py-px font-mono text-[10px] uppercase tracking-wide text-muted">
                default
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-sans text-xs text-muted">
            {theme.blurb}
          </p>
        </div>
      </div>
    </button>
  );
}

/**
 * The follow-OS card. Its preview is a split of the two brand themes it toggles
 * between — hookd (dark) on the left, hookd light on the right — so the idea
 * reads at a glance without the card having to resolve the live OS state. Same
 * radio semantics and selection affordance as every other card; the lime accent
 * is not borrowed for decoration (the chips use each brand's own real swatch).
 */
function SystemThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: SystemThemeMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  const { dark: d, light: l } = theme;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border text-left",
        "transition-colors duration-[80ms] focus-visible:outline-2",
        selected
          ? "border-accent ring-2 ring-accent"
          : "border-border hover:border-muted",
      )}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-accent-fill text-on-accent"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      )}

      {/* split preview: the two brand palettes side by side */}
      <div className="flex">
        <SystemHalf s={d} />
        <div
          className="w-px shrink-0"
          aria-hidden
          style={{ backgroundColor: l.border }}
        />
        <SystemHalf s={l} />
      </div>

      {/* label footer — in app chrome, not either theme's colors */}
      <div className="flex items-center justify-between gap-2 border-t border-border bg-surface px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-sans text-sm font-semibold text-text">
              {theme.label}
            </span>
            <span className="rounded-sm border border-border px-1 py-px font-mono text-[10px] uppercase tracking-wide text-muted">
              auto
            </span>
          </div>
          <p className="mt-0.5 truncate font-sans text-xs text-muted">
            {theme.blurb}
          </p>
        </div>
      </div>
    </button>
  );
}

/** One half of the system card's split preview, painted in a brand palette. */
function SystemHalf({ s }: { s: ThemeMeta["swatch"] }) {
  return (
    <div className="w-1/2 p-3" style={{ backgroundColor: s.bg }}>
      <div
        className="rounded-sm border"
        style={{ backgroundColor: s.surface, borderColor: s.border }}
      >
        <MockRow
          s={s}
          glyph={s.pass}
          event="charge.succeeded"
          code="200"
          codeColor={s.pass}
        />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span
          className="rounded-sm px-2 py-0.5 font-sans text-[11px] font-semibold"
          style={{ backgroundColor: s.accent, color: s.onAccent }}
        >
          Replay
        </span>
      </div>
    </div>
  );
}

function MockRow({
  s,
  glyph,
  event,
  code,
  codeColor,
}: {
  s: ThemeMeta["swatch"];
  glyph: string;
  event: string;
  code: string;
  codeColor: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: glyph }}
      />
      <span
        className="min-w-0 flex-1 truncate font-mono text-[11px]"
        style={{ color: s.text }}
      >
        {event}
      </span>
      <span className="font-mono text-[11px]" style={{ color: codeColor }}>
        {code}
      </span>
    </div>
  );
}

/** #rrggbb + alpha → rgba() string, for low-alpha tint washes in inline styles. */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
