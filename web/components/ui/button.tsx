import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Buttons use Hanken 600 with verb labels and NO "→" glyph (DESIGN §6).
// Primary = lime fill + dark ink (the only filled control). Secondary = hairline
// border, no fill. Radius is 3px (controls). Focus ring is handled globally.
const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm font-sans font-semibold whitespace-nowrap cursor-pointer select-none transition-colors duration-[80ms] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2",
  {
    variants: {
      variant: {
        primary:
          "bg-accent-fill text-on-accent hover:brightness-110 active:brightness-95",
        secondary:
          "border border-border bg-transparent text-text hover:bg-surface-hi",
        ghost: "bg-transparent text-muted hover:text-text hover:bg-surface-hi",
        danger:
          "border border-transparent bg-transparent text-fail hover:bg-[color-mix(in_oklab,var(--fail)_14%,transparent)]",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, type, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(button({ variant, size }), className)}
        {...props}
      />
    );
  },
);
