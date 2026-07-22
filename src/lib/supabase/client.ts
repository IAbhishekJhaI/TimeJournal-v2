"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser Supabase client — used ONLY for authentication (sign-in, sign-out,
 * session). All application data goes through our own /api (ADR 0001), so this
 * client never reads or writes user rows directly.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
