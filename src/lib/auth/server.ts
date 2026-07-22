import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-component auth guard. Returns the authenticated Supabase user, or
 * redirects to /login. The session cookie is kept fresh by proxy.ts; this only
 * reads it (mirrors requireUser() on the API side).
 */
export async function requireUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
