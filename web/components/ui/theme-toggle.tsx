"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_THEME } from "@/lib/theme";

/** A real, in-place dark/light toggle (STANDOUT §2.3 item 15).
 *
 *  It flips the whole app between the two brand themes via next-themes
 *  `setTheme` — `hookd` (dark) ⇄ `hookd-light` (light) — with no navigation, so
 *  it works on PUBLIC, logged-out surfaces (login, share links) as well as in
 *  the app chrome. It used to be a <Link> to the auth-gated
 *  /settings/appearance, which bounced logged-out visitors into the auth wall.
 *
 *  The full picker (system + the two brand themes) still lives at
 *  /settings/appearance for signed-in users; this is the one-tap switch.
 *
 *  Styled to match Button `variant="ghost" size="icon"` so the command bar is
 *  visually unchanged. Mount-gated so the icon never mismatches on hydration. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  // next-themes resolves `system` to the raw "light"/"dark", and explicit picks
  // to their id ("hookd" / "hookd-light"). Anything light-ish counts as light.
  const isLight =
    resolvedTheme === "hookd-light" || resolvedTheme === "light";
  // Before mount the resolved theme is unknown; show the brand default (dark).
  const showLight = mounted && isLight;

  const toggle = () => {
    setTheme(isLight ? DEFAULT_THEME : "hookd-light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={showLight ? "switch to dark theme" : "switch to light theme"}
      title={showLight ? "switch to dark theme" : "switch to light theme"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-sm bg-transparent text-muted",
        "transition-colors duration-[80ms] hover:bg-surface-hi hover:text-text",
        "focus-visible:outline-2",
      )}
    >
      {showLight ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
