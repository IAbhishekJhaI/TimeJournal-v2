import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link / OAuth callback. Supabase Auth redirects here with a `code`
 * (PKCE) after the user clicks the emailed link; we exchange it for a
 * session cookie and then send the user on to the app. This is the route
 * that actually *creates* a browser session — `proxy.ts` only refreshes an
 * existing one, and `requireUser()` only reads it (IMPLEMENTATION_PLAN.md §2.1).
 *
 * On success the signup DB trigger (0002) has already ensured a
 * `public.users` row exists (invite-only), so the app can assume a profile.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // `next` lets the caller deep-link back to where they were; only ever a
  // same-origin path, never an absolute URL (open-redirect guard).
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", errorDescription ?? error);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "missing authorization code");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const url = new URL("/login", origin);
    // Invite-only: a rejected signup trigger surfaces here as an exchange error.
    url.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, origin));
}
