import type { Metadata } from "next";
import { ThemePicker } from "@/components/theme/theme-picker";

export const metadata: Metadata = {
  title: "Appearance",
};

/** Appearance settings — the dashboard theme picker. Renders inside the (app)
 *  shell (command bar + instrument backdrop) provided by app/(app)/layout.tsx.
 *  The picker itself is a client component (needs next-themes + localStorage). */
export default function AppearancePage() {
  return (
    <section className="mx-auto w-full max-w-5xl">
      <header className="mb-5">
        <h1 className="font-sans text-xl font-semibold text-text">Appearance</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Choose a dashboard theme. Your choice is saved in this browser and
          applies instantly across the app.
        </p>
      </header>

      <ThemePicker />
    </section>
  );
}
