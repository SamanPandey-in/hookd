import type { Metadata } from "next";

// Tab title for a single endpoint's settings (/app/[id]/settings). Overrides the
// inherited "inspector" title (U-6). Reads "endpoint settings · hookd".
export const metadata: Metadata = {
  title: "endpoint settings",
};

export default function EndpointSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
