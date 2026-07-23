import "./load-env";
import postgres from "postgres";

/**
 * Standalone connectivity check for DATABASE_URL — the exact connection the app
 * uses (transaction pooler, prepare:false). Prints the real postgres error so
 * we don't have to dig it out of Next's wrapped "Failed query" logs.
 *
 * Run: npm run db:check
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  try {
    const u = new URL(url);
    console.log(
      `Connecting -> host=${u.hostname} port=${u.port || "(default)"} ` +
        `user=${decodeURIComponent(u.username)} db=${u.pathname.slice(1)} ` +
        `sslmode=${u.searchParams.get("sslmode") ?? "(none)"} pwd_len=${u.password.length}`,
    );
  } catch {
    console.error("DATABASE_URL is not a valid URL");
  }

  const sql = postgres(url, { prepare: false });
  try {
    const ping = await sql`select 1 as ok`;
    console.log("select 1 ->", ping[0]);
    const cnt = await sql`select count(*)::int as n from users`;
    console.log("users row count ->", cnt[0].n);
    console.log("\nSUCCESS — DATABASE_URL connects and the schema is present.");
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string; hint?: string; cause?: unknown };
    console.error("\nQUERY FAILED — this is the real error:");
    console.error("  message:", err.message);
    console.error("  code:   ", err.code);
    console.error("  detail: ", err.detail);
    console.error("  hint:   ", err.hint);
    const cause = err.cause as { message?: string; code?: string } | undefined;
    if (cause) console.error("  cause:  ", cause.message ?? cause, cause.code ?? "");
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
