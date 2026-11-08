import { ImageResponse } from "next/og";

// Apple touch icon — the diamond mark on the brand near-black, generated so it
// stays in sync with the design tokens (no separate PNG to hand-maintain).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0D0F",
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            background: "#B8FF2E",
            borderRadius: 18,
            transform: "rotate(45deg)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
