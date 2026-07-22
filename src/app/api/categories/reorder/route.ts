import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { reorderCategories } from "@/lib/api/categories";
import { withErrorHandling } from "@/lib/api/errors";
import { categoryReorderSchema } from "@/lib/api/schemas";

export const PATCH = withErrorHandling(async (request) => {
  const user = await requireUser();
  const body = categoryReorderSchema.parse(await request.json());
  const result = await reorderCategories(user.id, body);
  return NextResponse.json({ ok: true, ...result });
});
