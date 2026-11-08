import type { Metadata } from "next";
import { ThemePicker } from "@/components/theme/theme-picker";

export const metadata: Metadata = {
  title: "appearance",
};

/** Appearance settings — the dashboard theme picker. Renders inside the (app)
 *  shell (command bar + instrument backdrop) provided by app/(app)/layout.tsx.
 *  The picker itself is a client component (needs next-themes + localStorage). */
export default function AppearancePage() {
  return (
    <section className="mx-auto w-full max-w-5xl">
      <header className="mb-5">
        <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
          appearance
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">
          choose a dashboard theme. your choice applies instantly and follows
          your account across devices.
        </p>
      </header>

      <ThemePicker />
    </section>
  );
}
