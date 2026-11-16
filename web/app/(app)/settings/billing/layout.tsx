import type { Metadata } from "next";

// Tab title for /settings/billing (U-6). The page re-exports the account
// billing component; this gives the route its own title. Reads
// "settings · billing · hookd".
export const metadata: Metadata = {
  title: "settings · billing",
};

export default function BillingSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
