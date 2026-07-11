import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { savedQueryCreateSchema } from "@/lib/api/schemas";
import { createSavedQuery, listSavedQueries } from "@/lib/api/saved-queries";

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const rows = await listSavedQueries(user.id);
  return NextResponse.json({ queries: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await requireUser();
  const body = savedQueryCreateSchema.parse(await request.json());

  const row = await createSavedQuery(user.id, body);
  return NextResponse.json({ query: row }, { status: 201 });
});
