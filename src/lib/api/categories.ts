import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { findCycle } from "./category-tree";
import { ApiError } from "./errors";
import type {
  categoryCreateSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
} from "./schemas";
import type { z } from "zod";

export async function listCategories(userId: string, includeArchived: boolean) {
  const where = includeArchived
    ? eq(categories.userId, userId)
    : and(eq(categories.userId, userId), eq(categories.archived, false));

  return db.select().from(categories).where(where).orderBy(categories.sortOrder);
}

export async function createCategory(
  userId: string,
  data: z.infer<typeof categoryCreateSchema>,
) {
  if (data.parentId) {
    await assertOwnedCategory(userId, data.parentId);
  }

  const [row] = await db
    .insert(categories)
    .values({
      userId,
      parentId: data.parentId ?? null,
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      color: data.color,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();

  return row;
}

export async function updateCategory(
  userId: string,
  id: string,
  data: z.infer<typeof categoryUpdateSchema>,
) {
  await assertOwnedCategory(userId, id);

  if (data.parentId) {
    if (data.parentId === id) {
      throw new ApiError(400, "a category cannot be its own parent");
    }
    await assertOwnedCategory(userId, data.parentId);
  }

  const [row] = await db
    .update(categories)
    .set({
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.code !== undefined && { code: data.code }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.archived !== undefined && { archived: data.archived }),
    })
    .where(and(eq(categories.userId, userId), eq(categories.id, id)))
    .returning();

  return row;
}

/** Archives (soft-deletes) a category. 409s if it still has active children. */
export async function archiveCategory(userId: string, id: string) {
  await assertOwnedCategory(userId, id);

  const activeChildren = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.parentId, id),
        eq(categories.archived, false),
      ),
    )
    .limit(1);

  if (activeChildren.length > 0) {
    throw new ApiError(409, "category has active children; archive them first");
  }

  const [row] = await db
    .update(categories)
    .set({ archived: true })
    .where(and(eq(categories.userId, userId), eq(categories.id, id)))
    .returning();

  return row;
}

/**
 * Batch reorder / re-parent, applied in one transaction. Validates that every
 * touched id (and every new parent) belongs to the user, and that the
 * resulting parent graph stays acyclic, before writing anything.
 */
export async function reorderCategories(
  userId: string,
  items: z.infer<typeof categoryReorderSchema>,
) {
  const ids = [...new Set(items.map((i) => i.id))];
  if (ids.length !== items.length) {
    throw new ApiError(400, "duplicate category id in reorder payload");
  }

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.userId, userId));

    const parentById = new Map<string, string | null>(
      owned.map((c) => [c.id, c.parentId]),
    );

    for (const item of items) {
      if (!parentById.has(item.id)) {
        throw new ApiError(404, `category not found: ${item.id}`);
      }
      if (item.parentId !== undefined && item.parentId !== null) {
        if (item.parentId === item.id) {
          throw new ApiError(400, "a category cannot be its own parent");
        }
        if (!parentById.has(item.parentId)) {
          throw new ApiError(404, `parent category not found: ${item.parentId}`);
        }
      }
      // Apply the proposed parent into the working map for cycle detection.
      if (item.parentId !== undefined) {
        parentById.set(item.id, item.parentId);
      }
    }

    const cyclic = findCycle(parentById);
    if (cyclic) {
      throw new ApiError(400, "reorder would create a category cycle");
    }

    for (const item of items) {
      await tx
        .update(categories)
        .set({
          sortOrder: item.sortOrder,
          ...(item.parentId !== undefined && { parentId: item.parentId }),
        })
        .where(and(eq(categories.userId, userId), eq(categories.id, item.id)));
    }

    return { updated: items.length };
  });
}

async function assertOwnedCategory(userId: string, id: string) {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, id)))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "category not found");
  }
}
