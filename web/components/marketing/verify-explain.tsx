import { Section, SectionHeading } from "@/components/marketing/section";
import { SignatureVerifyPanel } from "@/components/inspector/signature-verify-panel";
import { FieldLabel } from "@/components/ui/panel";
import type { Provider, VerifyCause } from "@/lib/types";

// The differentiator (PRODUCT §3.1, F2). Providers return a misleading error;
// we name the actual mechanism. Each "after" is the real SignatureVerifyPanel
// rendered static (animate=false) so the section shows the product, not a
// screenshot. Causes are the recurring ones from research, not invented.
interface Case {
  provider: Provider;
  providerError: string;
  cause: VerifyCause;
  summary: string;
  details: Record<string, string>;
}

const CASES: Case[] = [
  {
    provider: "stripe",
    providerError: "No signatures found matching the expected signature for payload",
    cause: "body_possibly_altered",
    summary:
      "body was re-serialized before verify (whitespace differs) — your json parser mutated the raw bytes. verify against the raw body.",
    details: { culprit: "express.json()", fix: "read raw body first" },
  },
  {
    provider: "shopify",
    providerError: "missing_hmac / 401 unauthorized",
    cause: "encoding_mismatch",
    summary:
      "signature is base64 but your secret produced hex — shopify signs base64, not hex like stripe.",
    details: { expected: "base64", computed: "hex" },
  },
];

export function VerifyExplain() {
  return (
    <Section className="pt-8 pb-8">
      <SectionHeading
        index="01"
        kicker="verify"
        title="stop guessing why a signature failed"
        lead="the provider tells you nothing useful. we read the raw bytes, the header, the secret and the clock, and name the one cause that actually broke it."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {CASES.map((c) => (
          <div
            key={c.provider}
            className="grid grid-cols-1 gap-4 rounded-md border border-border bg-surface p-4 sm:grid-cols-2"
          >
            {/* what the provider told you */}
            <div className="flex flex-col gap-2">
              <FieldLabel>the provider said</FieldLabel>
              <div
                className="flex-1 rounded-sm border px-3 py-2.5"
                style={{
                  borderColor:
                    "color-mix(in oklab, var(--fail) 30%, var(--border))",
                }}
              >
                <p className="font-mono text-xs leading-relaxed text-muted break-words">
                  {c.providerError}
                </p>
              </div>
            </div>

            {/* the actual cause, from the real verify panel */}
            <div className="flex flex-col gap-2">
              <FieldLabel>we found</FieldLabel>
              <SignatureVerifyPanel
                status="fail"
                cause={c.cause}
                summary={c.summary}
                details={c.details}
                provider={c.provider}
                animate={false}
                className="flex-1"
              />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
