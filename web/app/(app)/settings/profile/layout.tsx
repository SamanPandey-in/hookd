import type { Metadata } from "next";

// Tab title for /settings/profile (U-6). Reads "settings · profile · hookd".
export const metadata: Metadata = {
  title: "settings · profile",
};

export default function ProfileSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
