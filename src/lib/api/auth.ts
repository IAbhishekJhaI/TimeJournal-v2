import { auth } from "@clerk/nextjs/server";
import { ApiError } from "./errors";
import { resolveUserId } from "./provision";

/** Resolves the authenticated user for the current request, or throws 401. */
export async function requireUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    throw new ApiError(401, "authentication required");
  }
  const id = await resolveUserId(clerkId);
  return { id };
}
