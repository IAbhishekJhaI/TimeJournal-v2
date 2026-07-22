import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, users } from "@/db/schema";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { matchCategory, minutesToSlotRange, parseTimeRange } from "@/lib/api/quicklog-parser";
import { RATE_LIMITS, checkRateLimit } from "@/lib/api/rate-limit";
import { quicklogParseSchema } from "@/lib/api/schemas";
import { nowInTimezone } from "@/lib/timezone";

export const POST = withErrorHandling(async (request) => {
  const user = await requireUser();
  checkRateLimit(`quicklog:parse:${user.id}`, RATE_LIMITS.quicklogParse);
  const { text, day: requestedDay } = quicklogParseSchema.parse(await request.json());

  const [profile] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const timezone = profile?.timezone ?? "Asia/Kolkata";
  const { day: today, minutes: nowMinutes } = nowInTimezone(timezone);
  const day = requestedDay ?? today;

  const range = parseTimeRange(text, nowMinutes);
  if (!range) {
    return NextResponse.json({
      ok: false,
      reason: "could not find a time range (e.g. '9-11', '930-11', '1-1:30pm') in the text",
    });
  }

  const { startSlot, endSlot } = minutesToSlotRange(range.startMinutes, range.endMinutes);

  const activeCategories = await db
    .select({ id: categories.id, code: categories.code, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, user.id));

  const { confident, candidates } = matchCategory(range.remainingText, activeCategories);

  return NextResponse.json({
    ok: true,
    day,
    startSlot,
    endSlot,
    assumedMeridiem: range.assumedMeridiem,
    category: confident,
    candidates: confident ? [] : candidates,
    // Always requires explicit client confirmation before saving —
    // this endpoint only proposes, never writes.
    needsConfirmation: true,
  });
});
