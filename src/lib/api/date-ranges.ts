export type Period = "day" | "week" | "month" | "year";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Inclusive [from, to] ISO date range for a period anchored on `date`. Week is Mon-Sun. */
export function resolveDateRange(period: Period, date: string): { from: string; to: string } {
  const anchor = new Date(`${date}T00:00:00Z`);

  switch (period) {
    case "day":
      return { from: date, to: date };

    case "week": {
      const dayOfWeek = anchor.getUTCDay(); // 0 = Sunday
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(anchor);
      monday.setUTCDate(anchor.getUTCDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return { from: toISODate(monday), to: toISODate(sunday) };
    }

    case "month": {
      const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
      const last = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
      return { from: toISODate(first), to: toISODate(last) };
    }

    case "year": {
      const first = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1));
      const last = new Date(Date.UTC(anchor.getUTCFullYear(), 11, 31));
      return { from: toISODate(first), to: toISODate(last) };
    }
  }
}
