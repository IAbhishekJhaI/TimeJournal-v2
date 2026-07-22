import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { __resetRateLimits, checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows requests up to the limit", () => {
    const limit = { limit: 3, windowMs: 1000 };
    expect(() => {
      for (let i = 0; i < 3; i++) checkRateLimit("k", limit);
    }).not.toThrow();
  });

  it("throws 429 on the request past the limit", () => {
    const limit = { limit: 2, windowMs: 1000 };
    checkRateLimit("k", limit);
    checkRateLimit("k", limit);
    try {
      checkRateLimit("k", limit);
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(429);
    }
  });

  it("isolates counts per key", () => {
    const limit = { limit: 1, windowMs: 1000 };
    checkRateLimit("a", limit);
    expect(() => checkRateLimit("b", limit)).not.toThrow();
  });

  it("frees capacity once the window passes", async () => {
    const limit = { limit: 1, windowMs: 30 };
    checkRateLimit("k", limit);
    await new Promise((r) => setTimeout(r, 45));
    expect(() => checkRateLimit("k", limit)).not.toThrow();
  });
});
