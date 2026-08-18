import { getRows } from "../src/sheets.js";

/**
 * Connectivity diagnostic. Run before anything else depends on Sheets:
 *
 *   npm run check-sheets
 *
 * The overwhelmingly common failure is not a bad key — it is forgetting to
 * share the spreadsheets with the service account, which surfaces as a 403
 * that reads like an authentication problem. src/sheets.ts distinguishes the
 * two; this script just exercises the path.
 */

const targets = [
  ["WATCHLIST_SHEET_ID", process.env.WATCHLIST_SHEET_ID],
  ["INVENTORY_SHEET_ID", process.env.INVENTORY_SHEET_ID],
] as const;

let failed = false;

for (const [name, id] of targets) {
  if (!id) {
    console.error(`${name}: NOT SET`);
    failed = true;
    continue;
  }
  try {
    const rows = await getRows(id, "A1:A1");
    console.log(`${name}: OK — reachable, ${rows.length === 0 ? "sheet is empty" : "has data"}`);
  } catch (err) {
    console.error(`${name}: FAILED — ${(err as Error).message}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nOne or more sheets are unreachable. Checklist:");
  console.error("  1. Both spreadsheets shared with GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor");
  console.error("  2. Google Sheets API enabled on the Cloud project");
  console.error("  3. GOOGLE_PRIVATE_KEY quoted, with its \\n sequences intact");
  process.exit(1);
}

console.log("\nBoth sheets reachable.");
