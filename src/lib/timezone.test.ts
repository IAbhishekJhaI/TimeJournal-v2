import { describe, expect, it } from "vitest";
import { nowInTimezone } from "./timezone";

describe("nowInTimezone", () => {
  it("computes local day and minutes-since-midnight for a fixed instant", () => {
    // 2026-07-22T18:30:00Z === 2026-07-23 00:00 IST (UTC+5:30).
    const at = new Date("2026-07-22T18:30:00Z");
    const ist = nowInTimezone("Asia/Kolkata", at);
    expect(ist.day).toBe("2026-07-23");
    expect(ist.minutes).toBe(0);
  });

  it("reflects a different zone for the same instant", () => {
    const at = new Date("2026-07-22T18:30:00Z");
    const utc = nowInTimezone("UTC", at);
    expect(utc.day).toBe("2026-07-22");
    expect(utc.minutes).toBe(18 * 60 + 30);
  });

  it("handles a pre-midnight local time without rolling the date", () => {
    // 23:45 IST on 2026-07-22 is 18:15Z.
    const at = new Date("2026-07-22T18:15:00Z");
    const ist = nowInTimezone("Asia/Kolkata", at);
    expect(ist.day).toBe("2026-07-22");
    expect(ist.minutes).toBe(23 * 60 + 45);
  });
});
