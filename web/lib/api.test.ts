import { describe, it, expect } from "vitest";
import { ApiError, isUnauthorized, isUpgradeRequired, API_URL } from "./api";

describe("ApiError", () => {
  it("carries status, message, and upgrade flag", () => {
    const e = new ApiError(402, "pro only", true);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ApiError");
    expect(e.status).toBe(402);
    expect(e.message).toBe("pro only");
    expect(e.upgrade).toBe(true);
  });
  it("defaults upgrade to false", () => {
    expect(new ApiError(500, "boom").upgrade).toBe(false);
  });
});

describe("isUnauthorized", () => {
  it("is true only for a 401 ApiError", () => {
    expect(isUnauthorized(new ApiError(401, "nope"))).toBe(true);
    expect(isUnauthorized(new ApiError(403, "nope"))).toBe(false);
    expect(isUnauthorized(new Error("401"))).toBe(false);
    expect(isUnauthorized(null)).toBe(false);
  });
});

describe("isUpgradeRequired", () => {
  it("is true for a 402 or an explicit upgrade flag", () => {
    expect(isUpgradeRequired(new ApiError(402, "pay"))).toBe(true);
    expect(isUpgradeRequired(new ApiError(400, "pay", true))).toBe(true);
    expect(isUpgradeRequired(new ApiError(400, "no"))).toBe(false);
    expect(isUpgradeRequired(new Error("402"))).toBe(false);
  });
});

describe("API_URL", () => {
  it("is a non-empty origin with no trailing slash", () => {
    expect(API_URL.length).toBeGreaterThan(0);
    expect(API_URL.endsWith("/")).toBe(false);
  });
});
