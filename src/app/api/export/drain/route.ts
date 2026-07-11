import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { withErrorHandling } from "@/lib/api/errors";
import { drainOutbox } from "@/lib/sheets/export";

/**
 * Cron worker endpoint (ARCHITECTURE.md §8) — drains every user's pending
 * outbox rows. Not user-authenticated; guarded by a shared secret the
 * GitHub Actions workflow sends as a bearer token, so it must never be
 * called from the browser.
 */
export const POST = withErrorHandling(async (request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new ApiError(500, "CRON_SECRET is not configured");
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    throw new ApiError(401, "unauthorized");
  }

  const result = await drainOutbox();
  return NextResponse.json(result);
});
