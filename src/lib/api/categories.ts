import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { ApiError } from "./errors";
import type { categoryCreateSchema, categoryUpdateSchema } from "./schemas";
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
