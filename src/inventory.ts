import { getRows, appendRow, updateRange, rowRange } from "./sheets.js";

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
   *  by hand — a stale or wrong URL is worse than an empty frame. */
  thumbUrl: string;
  year: number | null;
  /** Text the desk when this record crosses its alert threshold. Mirrors the
   *  watchlist's own switch: an alert that nobody receives is not an alert,
   *  and the buy at the end of this loop is made by a person. */
  alertSms: boolean;
  /** When the shop last bought a copy of this record, as opposed to addedAt,
   *  which is when the title first appeared on the shelf. Empty means it has
   *  never been restocked since. */
  lastPurchasedAt: string;
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
] as const;

/** A:Q: seventeen columns. Update if headers are appended. */
export const INVENTORY_RANGE = "A:Q";
const HEADER_RANGE = "A1:Q1";

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
  };
}

export function newInventoryId(): string {
  return `i_${Math.random().toString(36).slice(2, 10)}`;
}

/** Same contract as the watchlist's resolveRowNumber: see that comment. */
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

export async function ensureHeaders(): Promise<void> {
  const rows = await getRows(sheetId(), HEADER_RANGE);
  const existing = rows[0] ?? [];
  if (existing[0] === INVENTORY_HEADERS[0]) {
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

/** Merges `patch` onto the current sheet row: same rationale as patchWatchItem. */
export async function patchInventoryItem(
  id: string,
  patch: Partial<InventoryItem>,
): Promise<InventoryItem> {
  const rows = await fetchGrid();
  const rowNumber = resolveRowNumber(rows, id);
  if (rowNumber === null) throw new Error(`Inventory item ${id} not found`);

  const merged = { ...fromRow(rows[rowNumber - 1] ?? []), ...patch };
  await updateRange(sheetId(), rowRange(INVENTORY_RANGE, rowNumber), [toRow(merged)]);
  return merged;
}
