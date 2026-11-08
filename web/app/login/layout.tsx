import type { Metadata } from "next";

// login/page.tsx is a client component, so it can't export metadata itself.
// This segment layout carries the title + noindex (a bare auth gate has no SEO
// value and should stay out of the index).
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
