import { describe, expect, it } from "vitest";
import { resolveDateRange } from "./date-ranges";

describe("resolveDateRange", () => {
  it("day is a single-date range", () => {
    expect(resolveDateRange("day", "2026-07-22")).toEqual({
      from: "2026-07-22",
      to: "2026-07-22",
    });
  });

  it("week is Monday..Sunday around the anchor (Wed 2026-07-22)", () => {
    expect(resolveDateRange("week", "2026-07-22")).toEqual({
      from: "2026-07-20",
      to: "2026-07-26",
    });
  });

  it("week handles a Sunday anchor as the end of its week", () => {
    // 2026-07-26 is a Sunday.
    expect(resolveDateRange("week", "2026-07-26")).toEqual({
      from: "2026-07-20",
      to: "2026-07-26",
    });
  });

  it("month spans the first to last day, leap year aware", () => {
    expect(resolveDateRange("month", "2024-02-15")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("year spans Jan 1 to Dec 31", () => {
    expect(resolveDateRange("year", "2026-07-22")).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
});
