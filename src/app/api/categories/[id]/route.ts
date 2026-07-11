import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { archiveCategory, updateCategory } from "@/lib/api/categories";
import { withErrorHandling } from "@/lib/api/errors";
import { categoryUpdateSchema } from "@/lib/api/schemas";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (request, context) => {
  const { id } = await (context as Params).params;
  const user = await requireUser();
  const body = categoryUpdateSchema.parse(await request.json());

  const row = await updateCategory(user.id, id, body);
  return NextResponse.json({ category: row });
});

export const DELETE = withErrorHandling(async (_request, context) => {
  const { id } = await (context as Params).params;
  const user = await requireUser();

  const row = await archiveCategory(user.id, id);
  return NextResponse.json({ category: row });
});
