import { describe, it, expect } from "vitest";
import { deriveEventType } from "./derive";
import type { HeaderPair } from "@/lib/types";

const h = (pairs: Record<string, string>): HeaderPair[] =>
  Object.entries(pairs).map(([name, value]) => ({ name, value }));

describe("deriveEventType", () => {
  it("prefers the GitHub event header", () => {
    expect(deriveEventType('{"type":"ignored"}', h({ "X-GitHub-Event": "push" }))).toBe(
      "push",
    );
  });

  it("uses the Shopify topic header", () => {
    expect(
      deriveEventType("{}", h({ "X-Shopify-Topic": "orders/create" })),
    ).toBe("orders/create");
  });

  it("reads type / event / event_type from the body", () => {
    expect(deriveEventType('{"type":"charge.succeeded"}', [])).toBe(
      "charge.succeeded",
    );
    expect(deriveEventType('{"event":"ping"}', [])).toBe("ping");
    expect(deriveEventType('{"event_type":"user.created"}', [])).toBe(
      "user.created",
    );
  });

  it("reads topic and action from the body (U-5)", () => {
    expect(deriveEventType('{"topic":"invoice.paid"}', [])).toBe("invoice.paid");
    expect(deriveEventType('{"action":"opened"}', [])).toBe("opened");
  });

  it("unwraps a nested event.type (Slack)", () => {
    expect(deriveEventType('{"event":{"type":"message"}}', [])).toBe("message");
  });

  it("returns null when nothing meaningful is present (caller falls back)", () => {
    expect(deriveEventType("not json", [])).toBeNull();
    expect(deriveEventType('{"foo":"bar"}', [])).toBeNull();
    expect(deriveEventType("", [])).toBeNull();
  });
});
