"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";
import { DEFAULT_THEME, THEME_IDS, THEME_STORAGE_KEY } from "@/lib/theme";

/** next-themes config for the custom named themes.
 *
 *  - `attribute="data-theme"` so the chosen id lands on <html data-theme="…">,
 *    matching the token selectors in globals.css.
 *  - `defaultTheme="hookd"` — the brand dark theme (DESIGN: dark-mode-first).
 *  - `enableSystem={false}` — the picker is explicit; no OS following.
 *  - `storageKey="hookd-theme"` — persisted in localStorage (the "browser
 *    memory" requirement). next-themes injects a tiny blocking script that reads
 *    this before first paint, so there is no flash of the wrong theme. <html>
 *    carries suppressHydrationWarning in app/layout.tsx. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="data-theme"
      defaultTheme={DEFAULT_THEME}
      themes={THEME_IDS}
      enableSystem={false}
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
