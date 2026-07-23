import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { withErrorHandling } from "@/lib/api/errors";
import { addInvite, countInvites } from "@/lib/api/invites";
import { inviteCreateSchema } from "@/lib/api/schemas";

/**
 * Invite allowlist management. Any authenticated user can invite (the app is a
 * small trusted group); the signup trigger enforces the allowlist at sign-up.
 * GET returns only aggregate counts — never the invited emails.
 */
export const GET = withErrorHandling(async () => {
  await requireUser();
  const stats = await countInvites();
  return NextResponse.json(stats);
});

export const POST = withErrorHandling(async (request) => {
  const user = await requireUser();
  const { email } = inviteCreateSchema.parse(await request.json());
  const added = await addInvite(user.id, email);
  return NextResponse.json({ added }, { status: added ? 201 : 200 });
});
