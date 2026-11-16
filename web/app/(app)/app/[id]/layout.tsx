import type { Metadata } from "next";

// Tab title for the inspector (/app/[id]). The page is a client component, so a
// server layout carries the metadata (U-6). A static "inspector" (→ "inspector
// · hookd") is used rather than generateMetadata: the endpoint name lives behind
// a cookie-authenticated call to the separate API origin, which isn't worth a
// server round-trip here. Overrides the parent "endpoints" title.
export const metadata: Metadata = {
  title: "inspector",
};

export default function InspectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
