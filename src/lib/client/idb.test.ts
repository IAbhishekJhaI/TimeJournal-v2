import { describe, expect, it } from "vitest";
import { settleWrite, type PendingWrite } from "./idb";

const write = (overrides: Partial<PendingWrite> = {}): PendingWrite => ({
  key: "2026-10-29:40",
  day: "2026-10-29",
  slot: 40,
  categoryId: "cat-x",
  note: null,
  baseCategoryId: "cat-z",
  baseNote: null,
  clientUpdatedAt: "2026-10-29T09:00:00.000Z",
  queuedAt: 1000,
  ...overrides,
});

describe("settleWrite", () => {
  it("deletes when the stored write is the one that was sent", () => {
    const sent = write();
    expect(settleWrite(sent, sent)).toEqual({ action: "delete" });
  });

  it("deletes when nothing is stored any more", () => {
    expect(settleWrite(undefined, write())).toEqual({ action: "delete" });
  });

  it("deletes when re-edited mid-flight back to the sent value", () => {
    const stored = write({ queuedAt: 2000 });
    expect(settleWrite(stored, write())).toEqual({ action: "delete" });
  });

  it("keeps a different mid-flight edit, rebased onto the sent value", () => {
    const stored = write({ categoryId: "cat-y", queuedAt: 2000 });
    const result = settleWrite(stored, write());
    expect(result).toEqual({
      action: "keep",
      write: {
        ...stored,
        baseCategoryId: "cat-x",
        baseNote: null,
        clientUpdatedAt: null,
      },
    });
  });

  it("keeps a mid-flight revert to the old baseline (server now has the sent value)", () => {
    // Sent X over a server value of Z; the user reverted to Z during the request.
    const stored = write({ categoryId: "cat-z", queuedAt: 2000 });
    const result = settleWrite(stored, write());
    expect(result.action).toBe("keep");
    if (result.action === "keep") {
      expect(result.write.categoryId).toBe("cat-z");
      expect(result.write.baseCategoryId).toBe("cat-x");
    }
  });

  it("treats a note-only change as a different value", () => {
    const stored = write({ note: "gym", queuedAt: 2000 });
    expect(settleWrite(stored, write()).action).toBe("keep");
  });

  it("keeps a mid-flight clear (categoryId null)", () => {
    const stored = write({ categoryId: null, queuedAt: 2000 });
    const result = settleWrite(stored, write());
    expect(result.action).toBe("keep");
  });
});
