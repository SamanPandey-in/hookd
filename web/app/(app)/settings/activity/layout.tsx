import type { Metadata } from "next";

// Tab title for /settings/activity (U-6). Reads "settings · activity · hookd".
export const metadata: Metadata = {
  title: "settings · activity",
};

export default function ActivitySettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
