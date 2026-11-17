import { ImageResponse } from "next/og";
import {
  DiagnosisCard,
  parseDiagnosisParams,
  OG_SIZE,
} from "@/app/og/diagnosis-card";

// The diagnosis-card image route (STANDOUT §3.1). Renders ONLY from non-secret
// query params (parseDiagnosisParams reads provider/status/cause/summary + a 2–3
// key detail whitelist + a timestamp). Any body/secret/header/url param is
// ignored — the parser never looks for them. GET /og/diagnosis?provider=…&cause=…
//
// Text is set in next/og's built-in font. We do NOT load Commit Mono here: its
// bundled .woff carries an `ltag` table Satori's parser rejects (breaks the OG
// render). The card's identity comes from its layout, colors, coral/lime rule and
// inline-SVG glyphs, not the typeface.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const props = parseDiagnosisParams(searchParams);

  return new ImageResponse(<DiagnosisCard {...props} />, { ...OG_SIZE });
}
