import { describe, expect, it } from "vitest";
import {
  matchCategory,
  minutesToSlotRange,
  parseTimeRange,
  type CategoryCandidate,
} from "./quicklog-parser";

const NOON = 12 * 60;

describe("parseTimeRange", () => {
  it("parses a simple hour range and extracts the hint", () => {
    const r = parseTimeRange("9-11 studying", 10 * 60)!;
    expect(r).not.toBeNull();
    expect(r.startMinutes).toBe(9 * 60);
    expect(r.endMinutes).toBe(11 * 60);
    expect(r.remainingText).toBe("studying");
  });

  it("parses compact HMM times like 930-1130", () => {
    const r = parseTimeRange("930-1130 Fb", 10 * 60)!;
    expect(r.startMinutes).toBe(9 * 60 + 30);
    expect(r.endMinutes).toBe(11 * 60 + 30);
    expect(r.remainingText).toBe("Fb");
  });

  it("parses colon times and a leading hint", () => {
    const r = parseTimeRange("lunch 1-1:30pm", NOON)!;
    expect(r.startMinutes).toBe(13 * 60);
    expect(r.endMinutes).toBe(13 * 60 + 30);
    expect(r.remainingText).toBe("lunch");
    expect(r.assumedMeridiem).toBe(false);
  });

  it("applies a trailing meridiem to both tokens", () => {
    const r = parseTimeRange("2-4pm gym", 15 * 60)!;
    expect(r.startMinutes).toBe(14 * 60);
    expect(r.endMinutes).toBe(16 * 60);
  });

  it("infers am/pm from 'now' and flags the assumption", () => {
    const morning = parseTimeRange("9-11 x", 8 * 60)!;
    expect(morning.assumedMeridiem).toBe(true);
    expect(morning.startMinutes).toBe(9 * 60);

    const evening = parseTimeRange("9-11 x", 21 * 60)!;
    expect(evening.assumedMeridiem).toBe(true);
    expect(evening.startMinutes).toBe(21 * 60);
  });

  it("rolls the end past the start for wrap ranges (11-1)", () => {
    const r = parseTimeRange("11-1 x", 11 * 60)!;
    expect(r.endMinutes).toBeGreaterThan(r.startMinutes);
    expect(r.endMinutes).toBe(13 * 60);
  });

  it("returns null when no range is present", () => {
    expect(parseTimeRange("just some text", NOON)).toBeNull();
  });
});

describe("minutesToSlotRange", () => {
  it("maps minutes to inclusive 15-min slot indices", () => {
    expect(minutesToSlotRange(9 * 60, 11 * 60)).toEqual({ startSlot: 36, endSlot: 43 });
  });

  it("clamps to the 0..95 grid", () => {
    expect(minutesToSlotRange(0, 24 * 60)).toEqual({ startSlot: 0, endSlot: 95 });
  });
});

describe("matchCategory", () => {
  const cats: CategoryCandidate[] = [
    { id: "1", code: "Fb", name: "Reading" },
    { id: "2", code: "Fe", name: "Internship" },
    { id: "3", code: "Eb", name: "Eating out" },
  ];

  it("matches an exact code confidently", () => {
    const { confident } = matchCategory("Fb", cats);
    expect(confident?.id).toBe("1");
  });

  it("matches an exact name confidently", () => {
    const { confident } = matchCategory("internship", cats);
    expect(confident?.id).toBe("2");
  });

  it("returns candidates without guessing when ambiguous", () => {
    const { confident, candidates } = matchCategory("eating", cats);
    expect(confident?.id).toBe("3");
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("returns nothing for an empty hint", () => {
    expect(matchCategory("", cats)).toEqual({ confident: null, candidates: [] });
  });
});
