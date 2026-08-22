import { getRows } from "../src/sheets.js";

/**
 * Connectivity and integrity diagnostic. Run before anything else depends on
 * Sheets:
 *
 *   npm run check-sheets
 *
 * Two classes of problem, both of which have actually happened:
 *
 * 1. Access. The overwhelmingly common failure is a 403, which is almost never
 *    a bad key. It means the spreadsheets have not been shared with the
 *    service account. src/sheets.ts distinguishes that case.
 *
 * 2. Stray data outside the app's column range. The old values.append call
 *    silently wrote rows starting one column past the end of the range, and
 *    because both the cleanup and the verification used that same narrow
 *    range, the wreckage stayed invisible for a whole session. This script
 *    therefore deliberately reads WIDER than the app does.
 */

const APP_LAST_COLUMN_INDEX = 17; // R. The widest sheet is the watchlist, A:R
const WIDE_RANGE = "A1:BZ200";

const colName = (index: number): string => {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

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
    const rows = await getRows(id, WIDE_RANGE);
    const populated = rows.filter((r) => r.some((c) => (c ?? "").trim() !== "")).length;

    let rightmost = -1;
    for (const row of rows) {
      for (let i = row.length - 1; i >= 0; i -= 1) {
        if ((row[i] ?? "").trim() !== "") {
          rightmost = Math.max(rightmost, i);
          break;
        }
      }
    }

    console.log(`${name}: OK: reachable, ${populated === 0 ? "empty" : `${populated} populated row(s)`}`);

    if (rightmost > APP_LAST_COLUMN_INDEX) {
      console.error(
        `${name}: WARNING: data found in column ${colName(rightmost)}, beyond the app's ` +
          `range (A:${colName(APP_LAST_COLUMN_INDEX)}). The app cannot see it, so it will ` +
          `never be swept or cleaned. Clear columns ${colName(APP_LAST_COLUMN_INDEX + 1)} ` +
          `onward unless you put it there on purpose.`,
      );
      failed = true;
    }
  } catch (err) {
    console.error(`${name}: FAILED: ${(err as Error).message}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nChecklist:");
  console.error("  1. Both spreadsheets shared with GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor");
  console.error("  2. Google Sheets API enabled on the Cloud project");
  console.error("  3. GOOGLE_PRIVATE_KEY quoted, with its \\n sequences intact");
  console.error("  4. No stray data outside the app's column range");
  process.exit(1);
}

console.log("\nBoth sheets reachable, no data outside the expected range.");
