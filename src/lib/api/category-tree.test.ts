import { describe, expect, it } from "vitest";
import { findCycle } from "./category-tree";

describe("findCycle", () => {
  it("returns null for a flat set of roots", () => {
    const m = new Map<string, string | null>([
      ["a", null],
      ["b", null],
    ]);
    expect(findCycle(m)).toBeNull();
  });

  it("returns null for a valid two-level tree", () => {
    const m = new Map<string, string | null>([
      ["root", null],
      ["child", "root"],
      ["grand", "child"],
    ]);
    expect(findCycle(m)).toBeNull();
  });

  it("detects a direct self-cycle", () => {
    const m = new Map<string, string | null>([["a", "a"]]);
    expect(findCycle(m)).not.toBeNull();
  });

  it("detects an indirect cycle", () => {
    const m = new Map<string, string | null>([
      ["a", "b"],
      ["b", "c"],
      ["c", "a"],
    ]);
    expect(findCycle(m)).not.toBeNull();
  });

  it("treats a missing parent as a root (no false cycle)", () => {
    const m = new Map<string, string | null>([["a", "ghost"]]);
    expect(findCycle(m)).toBeNull();
  });
});
