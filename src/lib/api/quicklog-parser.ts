interface TimeToken {
  hour: number;
  minute: number;
  meridiem: "am" | "pm" | null;
}

function parseTimeToken(raw: string, meridiem: string | null): TimeToken | null {
  const clean = raw.trim();
  let hour: number;
  let minute: number;

  if (clean.includes(":")) {
    const [h, m] = clean.split(":");
    hour = Number(h);
    minute = Number(m);
  } else if (clean.length >= 3) {
    // Compact HMM / HHMM, e.g. "930" -> 9:30, "1130" -> 11:30.
    hour = Number(clean.slice(0, clean.length - 2));
    minute = Number(clean.slice(-2));
  } else {
    hour = Number(clean);
    minute = 0;
  }

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59 || hour > 23) {
    return null;
  }

  return {
    hour,
    minute,
    meridiem: meridiem === "am" || meridiem === "pm" ? meridiem : null,
  };
}

function toMinutesSinceMidnight(token: TimeToken): number {
  let hour = token.hour % 12; // 12am/12pm -> 0
  if (token.meridiem === "pm") hour += 12;
  if (token.meridiem === null && token.hour >= 13) {
    // Already 24h e.g. "14" or "1430" — leave as-is.
    hour = token.hour;
  }
  return hour * 60 + token.minute;
}

// Hour token is 1-2 digits with optional ":mm" (9, 11, 9:30) OR a 3-4 digit
// compact time (930, 1130) that parseTimeToken splits into H(H)+MM. The compact
// form is a documented quick-log format ("930-11 Fb"); keeping the token width
// at \d{1,2} here silently dropped it despite parseTimeToken supporting it.
const RANGE_RE =
  /(\d{1,2}:\d{2}|\d{3,4}|\d{1,2})\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2}|\d{3,4}|\d{1,2})\s*(am|pm)?/i;

export interface ParsedTimeRange {
  startMinutes: number;
  endMinutes: number;
  assumedMeridiem: boolean;
  remainingText: string;
}

/**
 * Extracts a time range and the leftover free text (the category hint) from
 * a quick-log string like "9-11 studying" or "lunch 1-1:30".
 * Returns null if no range-shaped substring is found at all.
 */
export function parseTimeRange(text: string, nowMinutes: number): ParsedTimeRange | null {
  const match = RANGE_RE.exec(text);
  if (!match) return null;

  const [full, startRaw, startMeridiemRaw, endRaw, endMeridiemRaw] = match;
  let startMeridiem = startMeridiemRaw?.toLowerCase() ?? null;
  let endMeridiem = endMeridiemRaw?.toLowerCase() ?? null;

  // "1-1:30pm" — trailing meridiem applies to both tokens if the first has none.
  if (!startMeridiem && endMeridiem) startMeridiem = endMeridiem;
  if (!endMeridiem && startMeridiem) endMeridiem = startMeridiem;

  const startToken = parseTimeToken(startRaw, startMeridiem);
  const endToken = parseTimeToken(endRaw, endMeridiem);
  if (!startToken || !endToken) return null;

  let assumedMeridiem = false;
  if (!startToken.meridiem && startToken.hour < 12 && startToken.hour > 0) {
    // No am/pm anywhere in the string — pick whichever reading lands
    // closest to "now", since journaling happens near-real-time. Always
    // surfaced via `assumedMeridiem` so the caller must confirm.
    const asAm = toMinutesSinceMidnight({ ...startToken, meridiem: "am" });
    const asPm = toMinutesSinceMidnight({ ...startToken, meridiem: "pm" });
    const useAm = Math.abs(asAm - nowMinutes) <= Math.abs(asPm - nowMinutes);
    startToken.meridiem = useAm ? "am" : "pm";
    endToken.meridiem = endToken.meridiem ?? startToken.meridiem;
    assumedMeridiem = true;
  }

  const startMinutes = toMinutesSinceMidnight(startToken);
  let endMinutes = toMinutesSinceMidnight(endToken);
  if (endMinutes <= startMinutes) endMinutes += 12 * 60; // "11-1" -> 11am-1pm

  return {
    startMinutes,
    endMinutes,
    assumedMeridiem,
    remainingText: (text.slice(0, match.index) + text.slice(match.index + full.length)).trim(),
  };
}

export function minutesToSlotRange(startMinutes: number, endMinutes: number) {
  const startSlot = Math.floor(startMinutes / 15);
  const endSlot = Math.ceil(endMinutes / 15) - 1;
  return { startSlot: Math.max(0, startSlot), endSlot: Math.min(95, endSlot) };
}

export interface CategoryCandidate {
  id: string;
  code: string;
  name: string;
}

/**
 * Matches the free-text hint against the user's categories. Exact code or
 * name match wins outright; otherwise every substring match is returned as
 * a candidate for the caller to disambiguate — never silently guessed.
 */
export function matchCategory(
  hint: string,
  categoriesList: CategoryCandidate[],
): { confident: CategoryCandidate | null; candidates: CategoryCandidate[] } {
  const needle = hint.trim().toLowerCase();
  if (!needle) return { confident: null, candidates: [] };

  const exact = categoriesList.filter(
    (c) => c.code.toLowerCase() === needle || c.name.toLowerCase() === needle,
  );
  if (exact.length === 1) return { confident: exact[0], candidates: exact };

  const partial = categoriesList.filter(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      needle.includes(c.name.toLowerCase()) ||
      c.code.toLowerCase() === needle,
  );

  if (partial.length === 1) return { confident: partial[0], candidates: partial };
  return { confident: null, candidates: exact.length > 0 ? exact : partial };
}
