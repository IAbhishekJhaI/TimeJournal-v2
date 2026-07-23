import { addDays } from "./slots";
import { nowInTimezone } from "./timezone";

/** One quarter-hour cell in the journal grid, tied to a specific calendar day. */
export interface Cell {
  day: string; // YYYY-MM-DD
  slot: number; // 0..95 within that day
  hour: number; // 0..23 hour-of-day for row labelling
}

export const cellKey = (day: string, slot: number) => `${day}:${slot}`;

export interface JournalWindow {
  cells: Cell[]; // exactly 96, in display order (top-left → bottom-right)
  currentIndex: number | null; // index of the slot containing "now", if in view
}

/**
 * Rolling 24-hour window ending at the top of the *next* hour, so the current
 * hour is the last row and the 23 hours before it fill the rest. Spans two
 * calendar days across midnight. E.g. at 16:55 the window is 17:00 yesterday →
 * 17:00 today (last row = 16:00–17:00 today, the current hour).
 */
export function liveWindow(timezone: string, now: Date = new Date()): JournalWindow {
  const { day: today, minutes } = nowInTimezone(timezone, now);
  const currentHour = Math.floor(minutes / 60);
  const startHour = (currentHour + 1) % 24;
  const startDay = startHour === 0 ? today : addDays(today, -1);
  const startSlot = startHour * 4;

  const cells: Cell[] = [];
  for (let i = 0; i < 96; i++) {
    const total = startSlot + i;
    const day = total < 96 ? startDay : addDays(startDay, 1);
    const slot = total % 96;
    cells.push({ day, slot, hour: Math.floor(slot / 4) });
  }

  const currentSlot = Math.floor(minutes / 15);
  const currentIndex = (((currentSlot - startSlot) % 96) + 96) % 96;
  return { cells, currentIndex };
}

/** A fixed calendar day (00:00–24:00). `currentSlot` highlights now if it's today. */
export function dayWindow(day: string, currentSlot: number | null): JournalWindow {
  const cells: Cell[] = Array.from({ length: 96 }, (_, i) => ({
    day,
    slot: i,
    hour: Math.floor(i / 4),
  }));
  return { cells, currentIndex: currentSlot };
}
