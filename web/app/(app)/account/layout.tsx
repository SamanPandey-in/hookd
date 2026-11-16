import type { Metadata } from "next";

// Tab title for the account/billing page (U-6). Reads "account · hookd".
export const metadata: Metadata = {
  title: "account",
};

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
