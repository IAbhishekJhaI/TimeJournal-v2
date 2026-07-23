import { db } from "@/db";
import { invitedEmails } from "@/db/schema";

export interface InviteStats {
  total: number;
  redeemed: number;
}

/**
 * Aggregate counts only — deliberately does NOT return invitee emails, so the
 * allowlist isn't exposed to every signed-in user. Only `redeemed_at` leaves
 * the DB layer.
 */
export async function countInvites(): Promise<InviteStats> {
  const rows = await db.select({ redeemedAt: invitedEmails.redeemedAt }).from(invitedEmails);
  return {
    total: rows.length,
    redeemed: rows.filter((r) => r.redeemedAt).length,
  };
}

/** Add an email to the invite allowlist (idempotent). Returns false if it existed. */
export async function addInvite(userId: string, email: string): Promise<boolean> {
  const [row] = await db
    .insert(invitedEmails)
    .values({ email: email.toLowerCase().trim(), invitedBy: userId })
    .onConflictDoNothing()
    .returning({ email: invitedEmails.email });
  return Boolean(row);
}
