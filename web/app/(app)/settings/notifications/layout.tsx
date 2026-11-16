import type { Metadata } from "next";

// Tab title for /settings/notifications (U-6). Reads
// "settings · notifications · hookd".
export const metadata: Metadata = {
  title: "settings · notifications",
};

export default function NotificationsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
