import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Ends the current Supabase session and clears its cookies. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", new URL(request.url).origin), {
    status: 303,
  });
}
