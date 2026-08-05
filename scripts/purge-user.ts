import "./load-env";
import postgres from "postgres";
import { createInterface } from "node:readline/promises";

/**
 * Hard-delete every trace of one user from the app database, keyed by email.
 *
 * Deletes the `users` row, which FK-cascades to categories, time_entries,
 * saved_queries and sheet_outbox. `invited_emails.invited_by` is ON DELETE SET
 * NULL, so invites this user issued survive (pointing at nobody) — pass
 * --delete-invite to also drop the target's own invited_emails row.
 *
 * This does NOT touch Clerk. Delete the Clerk user (and its Allowlist entry)
 * in the Clerk dashboard separately, or they can sign in again and a fresh,
 * empty users row will be auto-created.
 *
 * Usage (PowerShell):
 *   npm run purge:user -- someone@example.com                       # dry run
 *   npm run purge:user -- someone@example.com confirm               # delete
 *   npm run purge:user -- someone@example.com confirm delete-invite
 *
 * Flags are bare words, not --dashed: npm swallows unknown `--x` tokens as its
 * own cli config even after `--`, so they never reach this script. The dashed
 * spellings are still accepted for anyone invoking tsx directly.
 */

type Counts = {
  categories: number;
  timeEntries: number;
  savedQueries: number;
  sheetOutbox: number;
  invitesIssued: number;
  invitedEmailRow: number;
};

async function main() {
  const args = process.argv.slice(2).map((a) => a.replace(/^--/, ""));
  const flags = new Set(["confirm", "delete-invite"]);
  const email = args.find((a) => !flags.has(a))?.trim().toLowerCase();
  const confirmed = args.includes("confirm");
  const deleteInvite = args.includes("delete-invite");

  if (!email || !email.includes("@")) {
    console.error(
      "Usage: npm run purge:user -- <email> [confirm] [delete-invite]",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false });

  try {
    const host = new URL(url).hostname;
    const [user] = await sql<
      { id: string; email: string; clerk_id: string | null; created_at: Date }[]
    >`
      select id, email, clerk_id, created_at
      from users
      where lower(email) = ${email}
    `;

    if (!user) {
      console.log(`No users row with email ${email} on ${host}. Nothing to do.`);
      return;
    }

    const [counts] = await sql<Counts[]>`
      select
        (select count(*)::int from categories     where user_id = ${user.id}) as "categories",
        (select count(*)::int from time_entries   where user_id = ${user.id}) as "timeEntries",
        (select count(*)::int from saved_queries  where user_id = ${user.id}) as "savedQueries",
        (select count(*)::int from sheet_outbox   where user_id = ${user.id}) as "sheetOutbox",
        (select count(*)::int from invited_emails where invited_by = ${user.id}) as "invitesIssued",
        (select count(*)::int from invited_emails where lower(email) = ${email}) as "invitedEmailRow"
    `;

    console.log(`\nTarget database: ${host}`);
    console.log(`User:            ${user.email}`);
    console.log(`  id             ${user.id}`);
    console.log(`  clerk_id       ${user.clerk_id ?? "(none)"}`);
    console.log(`  created_at     ${user.created_at.toISOString()}`);
    console.log("\nRows that will be deleted (via ON DELETE CASCADE):");
    console.log(`  time_entries   ${counts.timeEntries}`);
    console.log(`  categories     ${counts.categories}`);
    console.log(`  saved_queries  ${counts.savedQueries}`);
    console.log(`  sheet_outbox   ${counts.sheetOutbox}`);
    console.log(`  users          1`);
    console.log(
      `\n  invited_emails row for this address: ${counts.invitedEmailRow}` +
        ` -> ${deleteInvite ? "DELETE" : "kept (pass delete-invite to remove)"}`,
    );
    console.log(
      `  invites issued by this user:         ${counts.invitesIssued}` +
        ` -> kept, invited_by set to null`,
    );

    if (!confirmed) {
      console.log(
        "\nDRY RUN — nothing deleted. Re-run with `confirm` to commit.",
      );
      return;
    }

    // Typed confirmation: an irreversible delete should never happen from a
    // stray shell-history arrow-up.
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `\nType the email to confirm permanent deletion: `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== email) {
      console.log("Mismatch — aborted, nothing deleted.");
      process.exitCode = 1;
      return;
    }

    await sql.begin(async (tx) => {
      if (deleteInvite) {
        await tx`delete from invited_emails where lower(email) = ${email}`;
      }
      await tx`delete from users where id = ${user.id}`;
    });

    const [after] = await sql<{ n: number }[]>`
      select count(*)::int as n from users where id = ${user.id}
    `;
    if (after.n !== 0) throw new Error("users row still present after delete");

    console.log(`\nDeleted. ${email} and all of its data are gone.`);
    console.log(
      "Remember to remove the user from Clerk (Users + Allowlist) if they " +
        "should not be able to sign in again.",
    );
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string };
    console.error("\nFAILED:");
    console.error("  message:", err.message);
    console.error("  code:   ", err.code);
    console.error("  detail: ", err.detail);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
