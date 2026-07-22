import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { RATE_LIMITS, checkRateLimit } from "@/lib/api/rate-limit";
import { drainOutbox } from "@/lib/sheets/export";

/** "Export now" button — drains only the current user's pending rows. */
export const POST = withErrorHandling(async () => {
  const user = await requireUser();
  checkRateLimit(`export:now:${user.id}`, RATE_LIMITS.exportNow);
  const result = await drainOutbox({ userId: user.id });
  return NextResponse.json(result);
});
