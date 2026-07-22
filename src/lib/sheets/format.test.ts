import { describe, expect, it } from "vitest";
import { FIRST_SLOT_COLUMN, LAST_SLOT_COLUMN, SLOT_COLUMNS, toSheetDateFormat } from "./format";

describe("toSheetDateFormat", () => {
  it("drops leading zeros to match the legacy sheet's column A format", () => {
    expect(toSheetDateFormat("2026-01-01")).toBe("2026.1.1");
    expect(toSheetDateFormat("2026-07-22")).toBe("2026.7.22");
    expect(toSheetDateFormat("2026-12-09")).toBe("2026.12.9");
  });
});

describe("slot column constants", () => {
  it("covers 96 fifteen-minute slots across C..CT", () => {
    expect(SLOT_COLUMNS).toBe(96);
    expect(FIRST_SLOT_COLUMN).toBe("C");
    expect(LAST_SLOT_COLUMN).toBe("CT");
  });
});
