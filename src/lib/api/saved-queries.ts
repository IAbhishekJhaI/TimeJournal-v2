import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedQueries } from "@/db/schema";
import { ApiError } from "./errors";
import type { savedQueryCreateSchema, savedQueryUpdateSchema } from "./schemas";
import type { z } from "zod";

export async function listSavedQueries(userId: string) {
  return db.select().from(savedQueries).where(eq(savedQueries.userId, userId));
}

export async function createSavedQuery(
  userId: string,
  data: z.infer<typeof savedQueryCreateSchema>,
) {
  const [row] = await db
    .insert(savedQueries)
    .values({ userId, name: data.name, categoryIds: data.categoryIds })
    .returning();

  return row;
}

export async function updateSavedQuery(
  userId: string,
  id: string,
  data: z.infer<typeof savedQueryUpdateSchema>,
) {
  const [row] = await db
    .update(savedQueries)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.categoryIds !== undefined && { categoryIds: data.categoryIds }),
    })
    .where(and(eq(savedQueries.userId, userId), eq(savedQueries.id, id)))
    .returning();

  if (!row) {
    throw new ApiError(404, "saved query not found");
  }

  return row;
}

export async function deleteSavedQuery(userId: string, id: string) {
  const [row] = await db
    .delete(savedQueries)
    .where(and(eq(savedQueries.userId, userId), eq(savedQueries.id, id)))
    .returning();

  if (!row) {
    throw new ApiError(404, "saved query not found");
  }
}
