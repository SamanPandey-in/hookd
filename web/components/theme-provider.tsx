"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";
import { DEFAULT_THEME, THEME_IDS, THEME_STORAGE_KEY } from "@/lib/theme";

/** next-themes config for the custom named themes.
 *
 *  - `attribute="data-theme"` so the chosen id lands on <html data-theme="…">,
 *    matching the token selectors in globals.css.
 *  - `defaultTheme="hookd"` — the brand dark theme (DESIGN: dark-mode-first).
 *    New visitors (empty localStorage) still get hookd, not "system".
 *  - `enableSystem` — the picker now offers a "system / follow-OS" choice.
 *  - `storageKey="hookd-theme"` — persisted in localStorage (the "browser
 *    memory" requirement). next-themes injects a tiny blocking script that reads
 *    this before first paint, so there is no flash of the wrong theme. <html>
 *    carries suppressHydrationWarning in app/layout.tsx.
 *
 *  HOW "system" WORKS HERE (verified against next-themes@0.4.6 source):
 *  next-themes' pre-paint blocking script hardcodes system → the literal strings
 *  "dark" / "light" (`matchMedia('(prefers-color-scheme: dark)')`), and for a
 *  `data-*` attribute it writes that resolved value RAW — the `value` map is only
 *  consulted for `class`, never for data attributes in the blocking script. So
 *  mapping system → "hookd" / "hookd-light" via a `value` map is impossible at
 *  pre-paint and would desync the blocking script from the React runtime.
 *
 *  Instead we let next-themes write `data-theme="dark"` / `data-theme="light"`
 *  and rely on globals.css, which already treats those as the brand themes:
 *  `data-theme="dark"` falls through to the `:root` default (= hookd dark) and
 *  `data-theme="light"` is an explicit alias of hookd-light. The blocking script
 *  AND the runtime both write the same values, so there is no flash and no
 *  desync, and the brand themes are selected exactly as required. next-themes'
 *  own matchMedia listener re-applies on OS change, giving live switching for
 *  free (no custom listener needed). The 8 explicit themes are unaffected: their
 *  ids are never "system", so the script writes their id verbatim as before.
 *
 *  `enableColorScheme` (default true) is kept: for the system choice it sets
 *  `color-scheme: dark|light` inline so native controls match the OS. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="data-theme"
      defaultTheme={DEFAULT_THEME}
      themes={THEME_IDS}
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
