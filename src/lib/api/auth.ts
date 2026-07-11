import { createClient } from "@/lib/supabase/server";
import { ApiError } from "./errors";

/** Resolves the authenticated user for the current request, or throws 401. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new ApiError(401, "authentication required");
  }

  return user;
}
