import { describe, it, expect } from "vitest";
import { cn, relativeTime, absoluteTime, formatDate, formatBytes } from "./utils";

describe("cn", () => {
  it("joins truthy classes and drops falsy ones", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
  it("de-duplicates conflicting tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("relativeTime", () => {
  const now = 1_000_000_000_000;
  it("formats seconds/minutes/hours/days", () => {
    expect(relativeTime(now, now)).toBe("0s");
    expect(relativeTime(now - 5_000, now)).toBe("5s");
    expect(relativeTime(now - 90_000, now)).toBe("1m");
    expect(relativeTime(now - 2 * 3600_000, now)).toBe("2h");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3d");
  });
  it("never goes negative for a future timestamp", () => {
    expect(relativeTime(now + 10_000, now)).toBe("0s");
  });
});

describe("absoluteTime", () => {
  it("renders ISO with a space instead of T", () => {
    expect(absoluteTime(Date.parse("2026-11-03T14:22:07.413Z"))).toBe(
      "2026-11-03 14:22:07.413Z",
    );
  });
});

describe("formatDate", () => {
  it("returns an em dash for empty/nullish input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
  it("treats small numbers as epoch seconds and large as ms", () => {
    expect(formatDate(1_762_000_000)).toBe("2025-11-01"); // seconds
    expect(formatDate(1_762_000_000_000)).toBe("2025-11-01"); // ms
  });
  it("parses numeric strings and ISO strings", () => {
    expect(formatDate("1762000000")).toBe("2025-11-01");
    expect(formatDate("2026-11-03T00:00:00Z")).toBe("2026-11-03");
  });
  it("renders an unparseable value as-is rather than throwing", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatBytes", () => {
  it("scales B / KB / MB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(812)).toBe("812 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2_411_724)).toBe("2.3 MB");
  });
});
