"use client";

import Link from "next/link";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";

/** Appearance entry point. Formerly a dark/light toggle; now that there are six
 *  named themes, this is a small palette button that links to the full picker
 *  at /settings/appearance. The command bar renders it unchanged (`<ThemeToggle />`).
 *  Styled to match Button `variant="ghost" size="icon"` so the bar is unchanged. */
export function ThemeToggle() {
  return (
    <Link
      href="/settings/appearance"
      aria-label="appearance"
      title="appearance"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-sm bg-transparent text-muted",
        "transition-colors duration-[80ms] hover:bg-surface-hi hover:text-text",
        "focus-visible:outline-2",
      )}
    >
      <Palette className="h-4 w-4" />
    </Link>
  );
}
