import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { createCategory, listCategories } from "@/lib/api/categories";
import { withErrorHandling } from "@/lib/api/errors";
import { categoryCreateSchema } from "@/lib/api/schemas";

export const GET = withErrorHandling(async (request) => {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("includeArchived") === "true";

  const rows = await listCategories(user.id, includeArchived);
  return NextResponse.json({ categories: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await requireUser();
  const body = categoryCreateSchema.parse(await request.json());

  const row = await createCategory(user.id, body);
  return NextResponse.json({ category: row }, { status: 201 });
});
