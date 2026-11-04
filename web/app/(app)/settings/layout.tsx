import * as React from "react";
import { SettingsNav, SettingsNavMobile } from "@/components/settings/settings-nav";

// Settings section shell (DESIGN §5.3). Wraps every /settings/* child with the
// section heading and a sub-nav: a left rail on desktop, a horizontally-
// scrolling tab strip on mobile. The rail links out to billing (/account) and
// docs (/docs) as well as the sibling settings routes — this file owns none of
// those targets, it only points at them.

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
          settings
        </h1>
        <p className="text-sm text-muted">
          your account, appearance, keys and activity.
        </p>
      </div>

      {/* Mobile: tab strip above the content. */}
      <SettingsNavMobile className="md:hidden" />

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        {/* Desktop: left rail. */}
        <SettingsNav className="hidden w-48 shrink-0 md:flex" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
