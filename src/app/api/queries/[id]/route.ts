import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { savedQueryUpdateSchema } from "@/lib/api/schemas";
import { deleteSavedQuery, updateSavedQuery } from "@/lib/api/saved-queries";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (request, context) => {
  const { id } = await (context as Params).params;
  const user = await requireUser();
  const body = savedQueryUpdateSchema.parse(await request.json());

  const row = await updateSavedQuery(user.id, id, body);
  return NextResponse.json({ query: row });
});

export const DELETE = withErrorHandling(async (_request, context) => {
  const { id } = await (context as Params).params;
  const user = await requireUser();

  await deleteSavedQuery(user.id, id);
  return NextResponse.json({ ok: true });
});
