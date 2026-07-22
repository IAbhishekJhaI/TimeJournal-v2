import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { getProfile, updateProfile } from "@/lib/api/profile";
import { meUpdateSchema } from "@/lib/api/schemas";

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  return NextResponse.json({ profile });
});

export const PATCH = withErrorHandling(async (request) => {
  const user = await requireUser();
  const body = meUpdateSchema.parse(await request.json());
  const profile = await updateProfile(user.id, body);
  return NextResponse.json({ profile });
});
