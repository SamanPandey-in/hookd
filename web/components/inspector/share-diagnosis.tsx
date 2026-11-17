"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  buildShareIntentHref,
  type DiagnosisResult,
} from "@/app/og/diagnosis-card";

// A quiet "share this diagnosis" affordance (STANDOUT §3.1). Shown on FAIL /
// UNVERIFIED only (never PASS) and only when the WHY is unlocked — the panel
// owns that gating. It opens an X intent prefilled with the house-voice line +
// a link to the /og/diagnosis card built from this result.
//
// SECURITY: the link and tweet are built via buildShareIntentHref, which derives
// the URL from non-secret verdict fields only (provider/status/cause/summary +
// a whitelisted detail set). No secret, body, headers or url can enter here.
// The origin is only known client-side, so the absolute link is filled in an
// effect after mount (SSR renders an intent without the card URL — no mismatch).
export function ShareDiagnosis({
  result,
  className,
}: {
  result: DiagnosisResult;
  className?: string;
}) {
  const [href, setHref] = React.useState(() => buildShareIntentHref(result));

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHref(buildShareIntentHref(result, window.location.origin));
  }, [result]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-sm font-mono text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-text focus-visible:outline-2",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      share this diagnosis
    </a>
  );
}
