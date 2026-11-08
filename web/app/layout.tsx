import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { BRAND } from "@/lib/brand";

// UI / display sans (DESIGN §3) — chosen deliberately over Inter/Geist.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const TITLE = `${BRAND.name} — verify every webhook signature, replay every event`;
const DESCRIPTION =
  "Capture, inspect, replay and signature-verify webhooks from Stripe, Razorpay, GitHub and more. See exactly why a signature failed.";

// The canonical public origin — drives metadataBase (so OG/Twitter/canonical
// URLs resolve absolutely), robots.ts and sitemap.ts. Override per-env with
// NEXT_PUBLIC_SITE_URL; the fallback is the launch domain.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://hookd.dev"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s · ${BRAND.name}` },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  // app/icon.svg, app/apple-icon.tsx, app/manifest.ts and app/opengraph-image.tsx
  // are auto-wired by Next's file conventions — no need to list them here.
  // No global `alternates.canonical`: a root-level canonical would make every
  // inheriting page point at "/". Set canonicals per-page if/when needed.
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  // Light/dark pair so the browser chrome matches the active scheme.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d0f" },
    { media: "(prefers-color-scheme: light)", color: "#f7f8f8" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${hanken.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        {/* Skip-to-content: first focusable element on every page, visually
            hidden until focused. Targets the #main landmark each page sets. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2 focus:font-sans focus:text-sm focus:text-text focus-visible:outline-2"
        >
          skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
