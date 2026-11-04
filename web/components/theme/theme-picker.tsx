"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES, type ThemeMeta } from "@/lib/theme";

/**
 * The appearance picker: a responsive grid of preview cards, one per theme.
 *
 * Each card is a mini mockup painted with that theme's *real* colors (inline
 * styles from the swatch in lib/theme.ts — not CSS vars, since every card shows
 * a different theme than the one currently applied). Clicking a card calls
 * next-themes `setTheme(id)`, which re-skins the whole app instantly and
 * persists to localStorage.
 *
 * Selection highlight is gated on `mounted` to avoid a hydration mismatch
 * (the resolved theme is unknown on the server).
 */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="dashboard theme"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {THEMES.map((t) => (
        <ThemeCard
          key={t.id}
          theme={t}
          selected={mounted && theme === t.id}
          onSelect={() => setTheme(t.id)}
        />
      ))}
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
