import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { drainOutbox } from "@/lib/sheets/export";

/** "Export now" button — drains only the current user's pending rows. */
export const POST = withErrorHandling(async () => {
  const user = await requireUser();
  const result = await drainOutbox({ userId: user.id });
  return NextResponse.json(result);
});
