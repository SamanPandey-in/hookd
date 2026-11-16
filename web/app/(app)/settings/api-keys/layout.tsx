import type { Metadata } from "next";

// Tab title for /settings/api-keys (U-6). Reads "settings · api keys · hookd".
export const metadata: Metadata = {
  title: "settings · api keys",
};

export default function ApiKeysSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
