import type { Metadata } from "next";

// Browser-tab title for the dashboard (/app). The (app) shell is a client
// component so it can't export metadata; this sibling server layout supplies it
// without changing the rendering (U-6). The root template is "%s · hookd", so
// this reads "endpoints · hookd". Nested routes (/app/[id], its settings)
// override with their own, more specific titles.
export const metadata: Metadata = {
  title: "endpoints",
};

export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
