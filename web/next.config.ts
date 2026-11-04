import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components / Partial Prefetching are intentionally OFF. This app is a
  // login-gated client dashboard: its authed routes (/app, /app/[id],
  // /settings/*, /account) only mount a page after /me resolves at runtime, so
  // they can't be rendered during the Cache-Components prerender / instant-
  // navigation validation pass — which tripped "Could not validate that a
  // segment has instant navigation" and forced prerender-only Suspense gymnastics.
  // The codebase uses no Cache Components features (`use cache`, cacheLife,
  // cacheTag), so enabling it bought nothing. With it off, marketing pages still
  // statically generate by default and the app's client routes just work.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
