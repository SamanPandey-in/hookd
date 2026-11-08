import type { MetadataRoute } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://hookd.dev"
).replace(/\/$/, "");

// Allow the public marketing + debugger surfaces; keep authed app routes, the
// bare login gate, the dev gallery and per-token share links out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app",
        "/settings",
        "/account",
        "/login",
        "/gallery",
        "/share/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
