import { ImageResponse } from "next/og";

// Branded social card (auto-wired into og:image + twitter:image by Next's file
// convention). Echoes the inspector/verify aesthetic: near-black canvas, the
// one lime accent reserved for a PASS verdict, mono-flavoured chrome.
//
// Fonts (STANDOUT §2.4 item 23): everything is set in the bundled Commit Mono
// .woff read off disk — the same local face the diagnosis/share cards use, so the
// whole OG set is hermetic (no network fetch at build/render) and visually of a
// piece with the all-mono verify panel. There is no `sans-serif` fallback and no
// Google Fonts dependency (a woff2 fetch there broke Satori's font parser at build).
export const alt = "hookd — see every webhook, verify every signature";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0B0D0F";
const SURFACE = "#14171A";
const BORDER = "#262B30";
const TEXT = "#E6E9ED";
const MUTED = "#8B949E";
const LIME = "#B8FF2E";

// Text is set in next/og's built-in font. We deliberately do NOT load Commit Mono:
// its bundled .woff carries an `ltag` table Satori's parser rejects, which broke
// the OG prerender. The card's identity is its layout, the one lime accent, the
// instrument grid and the inline-SVG check — not the typeface.
export default async function OpengraphImage() {
  const headlineFamily = "inherit";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: "72px 80px",
          fontFamily: "Commit Mono",
          // faint instrument grid
          backgroundImage: `linear-gradient(to right, ${BORDER}55 1px, transparent 1px), linear-gradient(to bottom, ${BORDER}55 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      >
        {/* top row: wordmark + live status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 34,
                height: 34,
                background: LIME,
                borderRadius: 6,
                transform: "rotate(45deg)",
              }}
            />
            <div
              style={{ fontSize: 44, fontWeight: 600, color: TEXT, letterSpacing: -1, fontFamily: headlineFamily }}
            >
              hookd
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 24,
              color: MUTED,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 12, background: LIME }} />
            listening · POST /i/ep_7fa2
          </div>
        </div>

        {/* headline — matches the hero (components/marketing/hero.tsx) exactly */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 600,
              color: TEXT,
              lineHeight: 1.05,
              letterSpacing: -2,
              fontFamily: headlineFamily,
            }}
          >
            see every webhook. verify every signature.
          </div>
          <div style={{ display: "flex", fontSize: 32, color: MUTED, maxWidth: 940 }}>
            capture, inspect, replay and verify webhooks from stripe, razorpay,
            github &amp; more — and see exactly why a signature failed.
          </div>
        </div>

        {/* bottom row: a PASS verdict chip (the one sanctioned lime use).
            alignSelf (not width:fit-content, which Satori rejects) keeps it
            sized to content; the check is an inline SVG, not the ✓ glyph, which
            otherwise triggers a build-time dynamic-font fetch. */}
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            alignItems: "center",
            gap: 16,
            padding: "16px 22px",
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderLeft: `4px solid ${LIME}`,
            borderRadius: 8,
            fontSize: 28,
            color: LIME,
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke={LIME}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12.5l5 5L20 6" />
          </svg>
          signature verified · HMAC-SHA256
        </div>
      </div>
    ),
    { ...size },
  );
}
