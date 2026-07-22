import { nowInTimezone } from "@/lib/timezone";

export const SLOTS_PER_DAY = 96;
export const SLOTS_PER_HOUR = 4;
export const MINUTES_PER_SLOT = 15;

/** Minutes-since-midnight at the start of a slot. */
export function slotStartMinutes(slot: number): number {
  return slot * MINUTES_PER_SLOT;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "9:00", "13:45" — 24h start time of a slot. */
export function slotTimeLabel(slot: number): string {
  const m = slotStartMinutes(slot);
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}

/** Hour label for the first slot of an hour, e.g. 7 -> "7 AM", 13 -> "1 PM". */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${suffix}`;
}

/** The current day (YYYY-MM-DD) and slot index (0..95) in the user's timezone. */
export function currentDayAndSlot(timezone: string, at: Date = new Date()) {
  const { day, minutes } = nowInTimezone(timezone, at);
  return { day, slot: Math.floor(minutes / MINUTES_PER_SLOT) };
}

/** Shift an ISO date (YYYY-MM-DD) by whole days, timezone-agnostic. */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** "Wed, 22 Jul" style label for a header. */
export function prettyDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
