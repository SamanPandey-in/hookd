import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

// The product mark: a small diamond (an instrument glyph, not an emoji) in the
// one accent hue, plus the lowercase wordmark (name from lib/brand).
export function LogoMark({
  className,
  withWordmark = true,
}: {
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        aria-hidden
        fill="none"
      >
        <rect
          x="8"
          y="0.5"
          width="10.6"
          height="10.6"
          rx="1.5"
          transform="rotate(45 8 0.5)"
          fill="var(--accent)"
        />
      </svg>
      {withWordmark && (
        <span className="font-sans text-sm font-semibold tracking-tight text-text">
          {BRAND.name}
        </span>
      )}
    </span>
  );
}
