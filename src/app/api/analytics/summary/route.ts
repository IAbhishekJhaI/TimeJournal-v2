import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/api/analytics";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { analyticsSummaryQuerySchema } from "@/lib/api/schemas";

export const GET = withErrorHandling(async (request) => {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const { period, date, groupBy } = analyticsSummaryQuerySchema.parse({
    period: searchParams.get("period"),
    date: searchParams.get("date"),
    groupBy: searchParams.get("groupBy") ?? undefined,
  });

  const summary = await getAnalyticsSummary(user.id, period, date, groupBy);
  return NextResponse.json(summary);
});
