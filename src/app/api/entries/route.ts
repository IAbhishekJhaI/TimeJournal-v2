import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { getEntries, upsertEntries } from "@/lib/api/entries";
import { entriesBatchSchema, entriesQuerySchema } from "@/lib/api/schemas";

export const GET = withErrorHandling(async (request) => {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const { from, to } = entriesQuerySchema.parse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });

  const entries = await getEntries(user.id, from, to);
  return NextResponse.json({ entries });
});

export const PUT = withErrorHandling(async (request) => {
  const user = await requireUser();
  const body = entriesBatchSchema.parse(await request.json());

  const { conflicts } = await upsertEntries(user.id, body);
  return NextResponse.json({ ok: true, conflicts });
});
