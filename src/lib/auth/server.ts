import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { resolveUserId } from "@/lib/api/provision";

/**
 * Server-component auth guard. Returns the internal user id, or redirects to
 * the Clerk sign-in page.
 */
export async function requireUserOrRedirect() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect("/sign-in");
  }
  const id = await resolveUserId(clerkId);
  return { id };
}
