import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError } from "./errors";
import type { meUpdateSchema } from "./schemas";
import type { z } from "zod";

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  sheetSpreadsheetId: string | null;
  createdAt: string;
}

/** The calling user's profile row. 404 if the trigger somehow didn't create it. */
export async function getProfile(userId: string): Promise<Profile> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      timezone: users.timezone,
      sheetSpreadsheetId: users.sheetSpreadsheetId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "profile not found");
  }

  return { ...row, createdAt: row.createdAt as unknown as string };
}

export async function updateProfile(
  userId: string,
  data: z.infer<typeof meUpdateSchema>,
): Promise<Profile> {
  const [row] = await db
    .update(users)
    .set({
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.timezone !== undefined && { timezone: data.timezone }),
      ...(data.sheetSpreadsheetId !== undefined && {
        sheetSpreadsheetId: data.sheetSpreadsheetId,
      }),
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      timezone: users.timezone,
      sheetSpreadsheetId: users.sheetSpreadsheetId,
      createdAt: users.createdAt,
    });

  if (!row) {
    throw new ApiError(404, "profile not found");
  }

  return { ...row, createdAt: row.createdAt as unknown as string };
}
