import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVIDERS } from "@/lib/types";
import { PROVIDER_META } from "@/lib/providers";
import type { Provider } from "@/lib/types";

// A styled native <select> for the provider. Native keeps it keyboard- and
// touch-correct for free; we only restyle the chrome.
export function ProviderSelect({
  value,
  onChange,
  includeAuto = true,
  id,
  className,
}: {
  value: Provider | "";
  onChange: (p: Provider | "") => void;
  includeAuto?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as Provider | "")}
        className="h-9 w-full appearance-none rounded-sm border border-border bg-surface-hi pl-3 pr-8 font-mono text-sm text-text cursor-pointer focus-visible:outline-2"
      >
        {includeAuto && <option value="">auto-detect</option>}
        {PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_META[p].label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
