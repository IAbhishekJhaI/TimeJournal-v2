import "./load-env";
import { readFileSync } from "node:fs";
import { ImportValidationError, importWorkbook } from "@/lib/import/run";

/**
 * Usage: npm run import:xlsx -- <path-to-xlsx> <user-id>
 * `user-id` is the target user's auth.users id (uuid) — find it in the
 * Supabase dashboard after they've signed up once via the invite flow.
 */
async function main() {
  const [filePath, userId] = process.argv.slice(2);
  if (!filePath || !userId) {
    console.error("Usage: npm run import:xlsx -- <path-to-xlsx> <user-id>");
    process.exit(1);
  }

  const buffer = readFileSync(filePath);

  let result;
  try {
    result = await importWorkbook(userId, buffer);
  } catch (error) {
    if (error instanceof ImportValidationError) {
      console.error(`Import aborted, nothing was written: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  console.log(`Categories created: ${result.categoriesCreated}`);
  console.log(`Entries created:    ${result.entriesCreated}`);

  if (result.caseCorrections.length > 0) {
    console.log("Case-corrected codes (sheet's own totals are case-insensitive):");
    for (const { from, to } of result.caseCorrections) {
      console.log(`  '${from}' -> '${to}'`);
    }
  }

  if (result.unknownCodes.length > 0) {
    console.warn(
      `Unknown codes skipped, not imported (not in Categories tab — likely typos): ${result.unknownCodes.join(", ")}`,
    );
  }

  if (result.validationMismatches.length > 0) {
    console.warn("Slot count mismatches vs the sheet's own totals:");
    for (const m of result.validationMismatches) {
      console.warn(`  ${m.code}: expected ${m.expected}, imported ${m.actual}`);
    }
    process.exitCode = 1;
  } else {
    console.log("All category totals match the sheet exactly.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
