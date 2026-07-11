import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, timeEntries } from "@/db/schema";
import { resolveDateRange, type Period } from "./date-ranges";

const MINUTES_PER_SLOT = 15;

interface CategoryRow {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  color: string;
}

export type GroupBy = "category" | "parent" | "color";

export interface SummaryBucket {
  key: string; // category id, root category id, or color hex depending on groupBy
  label: string;
  color: string;
  minutes: number;
  hours: number;
}

export async function getAnalyticsSummary(
  userId: string,
  period: Period,
  date: string,
  groupBy: GroupBy,
) {
  const { from, to } = resolveDateRange(period, date);

  const [allCategories, slotCounts] = await Promise.all([
    db
      .select({
        id: categories.id,
        parentId: categories.parentId,
        name: categories.name,
        code: categories.code,
        color: categories.color,
      })
      .from(categories)
      .where(eq(categories.userId, userId)),
    db
      .select({
        categoryId: timeEntries.categoryId,
        slots: sql<number>`count(*)`.mapWith(Number),
      })
      .from(timeEntries)
      .where(
        and(eq(timeEntries.userId, userId), gte(timeEntries.day, from), lte(timeEntries.day, to)),
      )
      .groupBy(timeEntries.categoryId),
  ]);

  const categoryById = new Map<string, CategoryRow>(allCategories.map((c) => [c.id, c]));
  const rootCache = new Map<string, CategoryRow>();

  function rootOf(categoryId: string): CategoryRow | undefined {
    if (rootCache.has(categoryId)) return rootCache.get(categoryId);
    let current = categoryById.get(categoryId);
    if (!current) return undefined;
    const seen = new Set<string>();
    while (current.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = categoryById.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    rootCache.set(categoryId, current);
    return current;
  }

  const buckets = new Map<string, SummaryBucket>();

  for (const { categoryId, slots } of slotCounts) {
    const minutes = slots * MINUTES_PER_SLOT;
    const category = categoryById.get(categoryId);
    if (!category) continue; // shouldn't happen (FK), guards a stale cache

    let key: string;
    let label: string;
    let color: string;

    if (groupBy === "category") {
      key = category.id;
      label = category.name;
      color = category.color;
    } else {
      const root = rootOf(categoryId) ?? category;
      color = root.color;
      key = groupBy === "parent" ? root.id : color;
      label = groupBy === "parent" ? root.name : color;
    }

    const existing = buckets.get(key);
    if (existing) {
      existing.minutes += minutes;
      existing.hours = existing.minutes / 60;
    } else {
      buckets.set(key, { key, label, color, minutes, hours: minutes / 60 });
    }
  }

  const results = [...buckets.values()].sort((a, b) => b.minutes - a.minutes);
  const totalMinutes = results.reduce((sum, b) => sum + b.minutes, 0);

  return { from, to, groupBy, totalMinutes, totalHours: totalMinutes / 60, buckets: results };
}
