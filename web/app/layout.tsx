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

export const metadata: Metadata = {
  title: { default: TITLE, template: `%s · ${BRAND.name}` },
  description: DESCRIPTION,
  applicationName: BRAND.name,
};

export const viewport: Viewport = {
  themeColor: "#0b0d0f",
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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
