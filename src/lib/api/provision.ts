import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";

// clerkId -> internal users.id (uuid), cached per server instance.
const cache = new Map<string, string>();

/**
 * Maps a Clerk user id to our internal `users.id`, creating or linking a
 * profile row on first sight. Pre-Clerk accounts are linked by email so their
 * existing data (categories, entries) keeps the same user_id — no remap needed.
 */
export async function resolveUserId(clerkId: string): Promise<string> {
  const cached = cache.get(clerkId);
  if (cached) return cached;

  const [byClerk] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (byClerk) {
    cache.set(clerkId, byClerk.id);
    return byClerk.id;
  }

  const cu = await currentUser();
  const email =
    cu?.primaryEmailAddress?.emailAddress ?? cu?.emailAddresses?.[0]?.emailAddress ?? null;
  const displayName = cu?.firstName ?? cu?.username ?? null;

  // Link an existing (pre-Clerk) account by email if one exists.
  if (email) {
    const [byEmail] = await db
      .select({ id: users.id, clerkId: users.clerkId })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (byEmail) {
      if (!byEmail.clerkId) {
        await db.update(users).set({ clerkId }).where(eq(users.id, byEmail.id));
      }
      cache.set(clerkId, byEmail.id);
      return byEmail.id;
    }
  }

  const [created] = await db
    .insert(users)
    .values({ clerkId, email: email ?? `${clerkId}@clerk.local`, displayName })
    .returning({ id: users.id });
  cache.set(clerkId, created.id);
  return created.id;
}
