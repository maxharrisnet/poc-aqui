import { getRows, updateRange, rowRange } from "../src/sheets.js";
import { searchRelease, getRelease, getMasterVersions } from "../src/discogs.js";
import { planPressings, AUTO_WATCH_LIMIT } from "../src/pressings.js";
import {
  ensureHeaders,
  fromRow,
  toRow,
  newInventoryId,
  INVENTORY_RANGE,
  type InventoryItem,
} from "../src/inventory.js";

/**
 * Fills in what a hand-typed or imported inventory row is missing, from Discogs:
 *
 *   npm run enrich-inventory                 # fill every incomplete row
 *   npm run enrich-inventory -- --dry-run    # show what it would write
 *   npm run enrich-inventory -- --limit 50   # stop after 50 rows
 *   npm run enrich-inventory -- --force      # re-fetch rows that look complete
 *
 * What it fills, and only when the cell is empty:
 *
 *   id          a generated one, so the API can address the row at all
 *   release_id  from a Discogs search on "artist album", vinyl only
 *   thumb_url   the sleeve, which is what makes 800 rows scannable
 *   year        pressing year
 *   artist      \
 *   album        > from the release, for rows imported with only an id
 *   condition   /
 *   pressings   which pressings a sweep prices, from the release's master
 *
 * It never overwrites a value that is already there. An import of 800 rows is
 * someone else's data, and a script that "corrects" it is a script that loses
 * it. --force re-fetches the Discogs-derived fields only, and still leaves
 * everything a person typed alone.
 *
 * Rate limit: the Discogs client serialises every call at ~55/min, so a row
 * needing both a search and a release lookup takes about 2.2s. 800 of those is
 * roughly half an hour, which is why --limit exists.
 */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitArg = args.indexOf("--limit");
const limit = limitArg === -1 ? Infinity : Number(args[limitArg + 1]);

// Infinity is the no-flag default and is deliberately allowed through; only a
// flag that was actually passed gets validated.
if (limitArg !== -1 && (!Number.isInteger(limit) || limit <= 0)) {
  console.error("--limit needs a positive whole number, e.g. --limit 50");
  process.exit(1);
}

const sheetId = process.env.INVENTORY_SHEET_ID;
if (!sheetId) {
  console.error("INVENTORY_SHEET_ID is not set: nothing to enrich.");
  process.exit(1);
}

/** What Discogs can supply. A row wanting none of these is skipped without
 *  spending a request on it. */
function missing(item: InventoryItem): string[] {
  const gaps: string[] = [];
  if (!item.id.trim()) gaps.push("id");
  if (item.releaseId === null) gaps.push("release_id");
  if (!item.thumbUrl.trim()) gaps.push("thumb_url");
  if (item.year === null) gaps.push("year");
  if (!item.artist.trim()) gaps.push("artist");
  if (!item.album.trim()) gaps.push("album");
  if (item.watchedReleaseIds.length === 0) gaps.push("pressings");
  return gaps;
}

await ensureHeaders();

const grid = await getRows(sheetId, INVENTORY_RANGE);
const dataRows = grid
  .map((row, i) => ({ row, rowNumber: i + 1 }))
  .slice(1)
  .filter(({ row }) => row.some((c) => (c ?? "").trim() !== ""));

if (dataRows.length === 0) {
  console.log("The inventory sheet is empty. Seed it first: npm run seed-inventory");
  process.exit(0);
}

const queued = dataRows
  .map(({ row, rowNumber }) => ({ item: fromRow(row), rowNumber }))
  .filter(({ item }) => force || missing(item).length > 0)
  .slice(0, limit === Infinity ? undefined : limit);

console.log(
  `${dataRows.length} row(s) in the sheet, ${queued.length} to work on` +
    (dryRun ? " (dry run, nothing will be written)" : "") +
    ".\n",
);

let filled = 0;
let unmatched = 0;
let failed = 0;

for (const { item, rowNumber } of queued) {
  const label = `${item.artist || "?"} — ${item.album || "?"}`.trim();
  const changes: string[] = [];

  try {
    if (!item.id.trim()) {
      item.id = newInventoryId();
      changes.push(`id=${item.id}`);
    }

    // A row with no release id has to be found by text first. Rows that came
    // in with an id skip straight to the lookup, which is both cheaper and
    // more accurate than re-searching for something already identified.
    if (item.releaseId === null) {
      const query = `${item.artist} ${item.album}`.trim();
      if (!query) {
        console.log(`  row ${rowNumber}: no artist or album to search on, skipped`);
        unmatched += 1;
        continue;
      }
      const hit = await searchRelease(query);
      if (!hit) {
        console.log(`  row ${rowNumber}: ${label} — no vinyl release matched`);
        unmatched += 1;
        continue;
      }
      item.releaseId = hit.id;
      changes.push(`release_id=${hit.id}`);
    }

    // Search results carry a thumbnail, but the release carries the year, the
    // canonical artist, a larger image and the master, so one lookup covers
    // every remaining gap rather than two partial ones.
    const wantsRelease =
      force ||
      !item.thumbUrl.trim() ||
      item.year === null ||
      !item.artist.trim() ||
      !item.album.trim() ||
      item.watchedReleaseIds.length === 0;

    if (wantsRelease && item.releaseId !== null) {
      const meta = await getRelease(item.releaseId);
      if ((force || !item.thumbUrl.trim()) && meta.coverImage) {
        item.thumbUrl = meta.coverImage;
        changes.push("thumb_url");
      }
      if ((force || item.year === null) && meta.year !== null) {
        item.year = meta.year;
        changes.push(`year=${meta.year}`);
      }
      if (!item.artist.trim() && meta.artist) {
        item.artist = meta.artist;
        changes.push(`artist=${meta.artist}`);
      }
      if (!item.album.trim() && meta.title) {
        item.album = meta.title;
        changes.push(`album=${meta.title}`);
      }

      // Which pressings a sweep should price. Resolved once: the plan always
      // holds at least the row's own release, so an enriched row never comes
      // back through here. Same rule as adding through the page.
      if (force || item.watchedReleaseIds.length === 0) {
        const master = meta.masterId
          ? await getMasterVersions(meta.masterId)
          : { total: 0, versions: [] };
        const plan = planPressings(master.versions, master.total, AUTO_WATCH_LIMIT, item.releaseId);
        item.masterId = meta.masterId;
        item.watchedReleaseIds = plan.needsUserSelection ? [item.releaseId] : plan.releaseIds;
        item.pressingScope = plan.scope;
        item.pressingCount = plan.totalVinylVersions;
        changes.push(
          `pressings=${item.watchedReleaseIds.length}` +
            (plan.needsUserSelection ? ` of ${plan.totalVinylVersions}, pick by hand` : ""),
        );
      }
    }

    if (changes.length === 0) {
      console.log(`  row ${rowNumber}: ${label} — nothing to add`);
      continue;
    }

    // Every match is printed, matched title included, because a text search
    // can confidently return the wrong pressing and the only way to catch
    // that is to be able to read what it picked.
    console.log(
      `  row ${rowNumber}: ${item.artist} — ${item.album}` +
        (item.releaseId ? ` [release ${item.releaseId}]` : "") +
        ` — ${changes.join(", ")}`,
    );

    if (!dryRun) {
      await updateRange(sheetId, rowRange(INVENTORY_RANGE, rowNumber), [toRow(item)]);
    }
    filled += 1;
  } catch (err) {
    failed += 1;
    console.error(`  row ${rowNumber}: ${label} — FAILED: ${(err as Error).message}`);
  }
}

console.log(
  `\n${dryRun ? "Would fill" : "Filled"} ${filled} row(s). ` +
    `${unmatched} unmatched, ${failed} failed.`,
);

if (unmatched > 0) {
  console.log(
    "Unmatched rows keep whatever they had. Add a release_id by hand for those: " +
      "a Discogs text search cannot tell two pressings of the same album apart.",
  );
}
