import { getRows, appendRow, updateRange, rowRange } from "./sheets.js";

export type PressingScope = "all" | "selected";
/** `alerted` means the last check crossed the limit. Alerts fire on the
 *  crossing only, so this is what stops a nightly re-alert for the same copy. */
export type SweepStatus = "watching" | "alerted";

export interface InventoryItem {
  id: string;
  artist: string;
  album: string;
  releaseId: number | null;
  condition: string;
  /** Copies on the shelf right now. */
  qty: number;
  /** Stock trigger: at or under this count the record arms its own watch.
   *  null means no trigger, so watching stays a manual decision. */
  minQty: number | null;
  shelfPriceMxn: number | null;
  /** What the copy actually cost to land, per unit. */
  landedCostMxn: number | null;
  /** Alert threshold: a copy found under this landed cost is worth telling a
   *  person about, because a person is who decides whether to buy it. */
  maxLandedMxn: number | null;
  watching: boolean;
  addedAt: string;
  notes: string;
  /** Discogs sleeve image. Filled by scripts/enrich-inventory.ts, never typed
   *  by hand: a stale or wrong URL is worse than an empty frame. */
  thumbUrl: string;
  year: number | null;
  /** Text the desk when this record crosses its alert threshold. An alert
   *  that nobody receives is not an alert, and the buy at the end of this
   *  loop is made by a person. */
  alertSms: boolean;
  /** When the shop last bought a copy of this record, as opposed to addedAt,
   *  which is when the title first appeared on the shelf. Empty means it has
   *  never been restocked since. */
  lastPurchasedAt: string;
  /** Discogs master, blank where a release has none. Resolved at add time. */
  masterId: number | null;
  /** What a sweep prices. Empty means "just releaseId": see sweepReleaseIds. */
  watchedReleaseIds: number[];
  pressingScope: PressingScope;
  /** Vinyl versions known at add time, so sweep cost is knowable before it runs. */
  pressingCount: number;
  lastCheckedAt: string | null;
  /** Cheapest landed cost found by the last check, and which pressing it was. */
  bestLandedMxn: number | null;
  bestReleaseId: number | null;
  status: SweepStatus;
  /** Soft delete. A blank cell reads as true so rows written before this
   *  column existed survive: deleting sheet rows is what resolveRowNumber
   *  exists to avoid. */
  active: boolean;
}

/** Column order is the sheet contract. Append only, never reorder. */
export const INVENTORY_HEADERS = [
  "id",
  "artist",
  "album",
  "release_id",
  "condition",
  "qty",
  "min_qty",
  "shelf_price_mxn",
  "landed_cost_mxn",
  "max_landed_mxn",
  "watching",
  "added_at",
  "notes",
  "thumb_url",
  "year",
  "alert_sms",
  "last_purchased_at",
  "master_id",
  "watched_release_ids",
  "pressing_scope",
  "pressing_count",
  "last_checked_at",
  "best_landed_mxn",
  "best_release_id",
  "status",
  "active",
] as const;

/** A:Z: twenty-six columns. Update if headers are appended. */
export const INVENTORY_RANGE = "A:Z";
const HEADER_RANGE = "A1:Z1";

const str = (v: string | undefined): string => v ?? "";
const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toRow(item: InventoryItem): string[] {
  return [
    item.id,
    item.artist,
    item.album,
    item.releaseId === null ? "" : String(item.releaseId),
    item.condition,
    String(item.qty),
    item.minQty === null ? "" : String(item.minQty),
    item.shelfPriceMxn === null ? "" : String(item.shelfPriceMxn),
    item.landedCostMxn === null ? "" : String(item.landedCostMxn),
    item.maxLandedMxn === null ? "" : String(item.maxLandedMxn),
    item.watching ? "TRUE" : "FALSE",
    item.addedAt,
    item.notes,
    item.thumbUrl,
    item.year === null ? "" : String(item.year),
    item.alertSms ? "TRUE" : "FALSE",
    item.lastPurchasedAt,
    item.masterId === null ? "" : String(item.masterId),
    item.watchedReleaseIds.join(","),
    item.pressingScope,
    String(item.pressingCount),
    item.lastCheckedAt ?? "",
    item.bestLandedMxn === null ? "" : String(item.bestLandedMxn),
    item.bestReleaseId === null ? "" : String(item.bestReleaseId),
    item.status,
    item.active ? "TRUE" : "FALSE",
  ];
}

export function fromRow(row: string[]): InventoryItem {
  return {
    id: str(row[0]),
    artist: str(row[1]),
    album: str(row[2]),
    releaseId: numOrNull(row[3]),
    condition: str(row[4]),
    qty: numOrNull(row[5]) ?? 0,
    minQty: numOrNull(row[6]),
    shelfPriceMxn: numOrNull(row[7]),
    landedCostMxn: numOrNull(row[8]),
    maxLandedMxn: numOrNull(row[9]),
    watching: str(row[10]).toUpperCase() === "TRUE",
    addedAt: str(row[11]),
    notes: str(row[12]),
    thumbUrl: str(row[13]),
    year: numOrNull(row[14]),
    alertSms: str(row[15]).toUpperCase() === "TRUE",
    lastPurchasedAt: str(row[16]),
    masterId: numOrNull(row[17]),
    watchedReleaseIds: str(row[18])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    pressingScope: str(row[19]) === "selected" ? "selected" : "all",
    pressingCount: numOrNull(row[20]) ?? 0,
    lastCheckedAt: str(row[21]) === "" ? null : str(row[21]),
    bestLandedMxn: numOrNull(row[22]),
    bestReleaseId: numOrNull(row[23]),
    status: str(row[24]) === "alerted" ? "alerted" : "watching",
    active: str(row[25]).trim().toUpperCase() !== "FALSE",
  };
}

export function newInventoryId(): string {
  return `i_${Math.random().toString(36).slice(2, 10)}`;
}

/** The pressings a sweep prices for this row. A row added through Watch or Add
 *  carries every pressing of its master; a row typed or seeded by hand has
 *  only the pressing on the shelf, which is the right thing to price until
 *  scripts/enrich-inventory.ts has resolved its master. */
export function sweepReleaseIds(
  item: Pick<InventoryItem, "releaseId" | "watchedReleaseIds">,
): number[] {
  if (item.watchedReleaseIds.length > 0) return item.watchedReleaseIds;
  return item.releaseId === null ? [] : [item.releaseId];
}

/** The row that already covers a release: the shelf pressing itself or any
 *  watched pressing of the same album. Inactive rows count, because reviving
 *  one beats appending a duplicate of it. */
export function findByRelease(items: InventoryItem[], releaseId: number): InventoryItem | undefined {
  return items.find((i) => i.releaseId === releaseId || i.watchedReleaseIds.includes(releaseId));
}

/**
 * Finds the 1-based sheet row holding `id`.
 *
 * Sheet row numbers must be resolved from the raw grid, never from the index
 * of a filtered array: a blank row anywhere above the target shifts the two
 * apart and the write lands on the wrong record. `rows` must be the full
 * response from getRows, header included.
 */
export function resolveRowNumber(rows: string[][], id: string): number | null {
  for (let i = 1; i < rows.length; i += 1) {
    if ((rows[i]?.[0] ?? "").trim() === id) return i + 1;
  }
  return null;
}

function sheetId(): string {
  const id = process.env.INVENTORY_SHEET_ID;
  if (!id) throw new Error("INVENTORY_SHEET_ID is not set");
  return id;
}

/**
 * Ensures row 1 holds the header. Safe to call repeatedly.
 *
 * Refuses to touch a row 1 that holds something other than the expected
 * header: if it were blindly overwritten, a deleted header row or a row
 * inserted above it would cause the next write to permanently destroy a
 * real record.
 */
export async function ensureHeaders(): Promise<void> {
  const rows = await getRows(sheetId(), HEADER_RANGE);
  const existing = rows[0] ?? [];
  if (existing[0] === INVENTORY_HEADERS[0]) {
    // A sheet created before a column was appended still carries the older,
    // shorter header. Extending it is safe. The columns it names are blank:
    // and without this the new column stays permanently unlabelled.
    if (existing.length < INVENTORY_HEADERS.length) {
      await updateRange(sheetId(), HEADER_RANGE, [[...INVENTORY_HEADERS]]);
    }
    return;
  }

  const isEmpty = existing.every((c) => (c ?? "").trim() === "");
  if (!isEmpty) {
    throw new Error(
      `Row 1 of the inventory sheet holds "${existing[0]}" instead of the expected header. ` +
        `Refusing to overwrite it: restore the header row, or clear row 1, before adding stock.`,
    );
  }
  await updateRange(sheetId(), HEADER_RANGE, [[...INVENTORY_HEADERS]]);
}

async function fetchGrid(): Promise<string[][]> {
  return getRows(sheetId(), INVENTORY_RANGE);
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const rows = await fetchGrid();
  return rows
    .slice(1) // header
    .filter((r) => (r[0] ?? "").trim() !== "")
    .map(fromRow);
}

export async function addInventoryItem(item: InventoryItem): Promise<InventoryItem> {
  await ensureHeaders();
  const rowNumber = await appendRow(sheetId(), INVENTORY_RANGE, toRow(item));

  // Read back what actually landed. Sheets has silently mangled writes before;
  // a wrong row is far worse than a failed one.
  const written = await getRows(sheetId(), rowRange(INVENTORY_RANGE, rowNumber));
  const id = written[0]?.[0] ?? "";
  if (id !== item.id) {
    throw new Error(
      `Inventory write verification failed: expected id "${item.id}" at row ${rowNumber}, ` +
        `found "${id}". The sheet may be in an inconsistent state: check it before retrying.`,
    );
  }
  return item;
}

/**
 * Merges `patch` onto whatever is currently in the sheet for `id`.
 *
 * Deliberately re-reads rather than writing a caller-held snapshot: a sweep can
 * take minutes, and PUTting a stale row silently reverts anything the user
 * changed in the meantime. Sheets has no compare-and-swap, so this narrows the
 * race to the read-write gap rather than closing it.
 */
export async function patchInventoryItem(
  id: string,
  patch: Partial<InventoryItem>,
): Promise<InventoryItem> {
  const rows = await fetchGrid();

  // The header grows with the schema. Extending it here, from the grid already
  // in hand, means the first write after a deploy labels the new columns
  // without a separate read, and a sheet that predates a column never shows
  // that column unlabelled.
  const header = rows[0] ?? [];
  if (header[0] === INVENTORY_HEADERS[0] && header.length < INVENTORY_HEADERS.length) {
    await updateRange(sheetId(), HEADER_RANGE, [[...INVENTORY_HEADERS]]);
  }

  const rowNumber = resolveRowNumber(rows, id);
  if (rowNumber === null) throw new Error(`Inventory item ${id} not found`);

  const merged = { ...fromRow(rows[rowNumber - 1] ?? []), ...patch };
  await updateRange(sheetId(), rowRange(INVENTORY_RANGE, rowNumber), [toRow(merged)]);
  return merged;
}
