import { getRows, appendRow, updateRange } from "./sheets.js";

export type PressingScope = "all" | "selected";
export type WatchStatus = "watching" | "alerted" | "acquired" | "paused";
export type Priority = "high" | "normal" | "low";

export interface WatchItem {
  id: string;
  artist: string;
  album: string;
  masterId: number | null;
  watchedReleaseIds: number[];
  pressingScope: PressingScope;
  pressingCount: number;
  maxLandedMxn: number | null;
  minCondition: string;
  priority: Priority;
  active: boolean;
  addedAt: string;
  lastCheckedAt: string | null;
  bestLandedMxn: number | null;
  bestReleaseId: number | null;
  status: WatchStatus;
  notes: string;
}

/** Column order is the sheet contract. Append only — never reorder. */
export const WATCHLIST_HEADERS = [
  "id",
  "artist",
  "album",
  "master_id",
  "watched_release_ids",
  "pressing_scope",
  "pressing_count",
  "max_landed_mxn",
  "min_condition",
  "priority",
  "active",
  "added_at",
  "last_checked_at",
  "best_landed_mxn",
  "best_release_id",
  "status",
  "notes",
] as const;

/** A:Q — seventeen columns. Update if headers are appended. */
export const WATCHLIST_RANGE = "A:Q";

const str = (v: string | undefined): string => v ?? "";
const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toRow(item: WatchItem): string[] {
  return [
    item.id,
    item.artist,
    item.album,
    item.masterId === null ? "" : String(item.masterId),
    item.watchedReleaseIds.join(","),
    item.pressingScope,
    String(item.pressingCount),
    item.maxLandedMxn === null ? "" : String(item.maxLandedMxn),
    item.minCondition,
    item.priority,
    item.active ? "TRUE" : "FALSE",
    item.addedAt,
    item.lastCheckedAt ?? "",
    item.bestLandedMxn === null ? "" : String(item.bestLandedMxn),
    item.bestReleaseId === null ? "" : String(item.bestReleaseId),
    item.status,
    item.notes,
  ];
}

export function fromRow(row: string[]): WatchItem {
  return {
    id: str(row[0]),
    artist: str(row[1]),
    album: str(row[2]),
    masterId: numOrNull(row[3]),
    watchedReleaseIds: str(row[4])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    pressingScope: str(row[5]) === "selected" ? "selected" : "all",
    pressingCount: numOrNull(row[6]) ?? 0,
    maxLandedMxn: numOrNull(row[7]),
    minCondition: str(row[8]),
    priority: (["high", "normal", "low"] as const).includes(str(row[9]) as Priority)
      ? (str(row[9]) as Priority)
      : "normal",
    active: str(row[10]).toUpperCase() === "TRUE",
    addedAt: str(row[11]),
    lastCheckedAt: str(row[12]) === "" ? null : str(row[12]),
    bestLandedMxn: numOrNull(row[13]),
    bestReleaseId: numOrNull(row[14]),
    status: (["watching", "alerted", "acquired", "paused"] as const).includes(
      str(row[15]) as WatchStatus,
    )
      ? (str(row[15]) as WatchStatus)
      : "watching",
    notes: str(row[16]),
  };
}

export function newWatchId(): string {
  return `w_${Math.random().toString(36).slice(2, 10)}`;
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
  const id = process.env.WATCHLIST_SHEET_ID;
  if (!id) throw new Error("WATCHLIST_SHEET_ID is not set");
  return id;
}

/** Ensures row 1 holds the header. Safe to call repeatedly. */
export async function ensureHeaders(): Promise<void> {
  const rows = await getRows(sheetId(), "A1:Q1");
  const existing = rows[0] ?? [];
  if (existing[0] === WATCHLIST_HEADERS[0]) return;
  await updateRange(sheetId(), "A1:Q1", [[...WATCHLIST_HEADERS]]);
}

async function fetchGrid(): Promise<string[][]> {
  return getRows(sheetId(), WATCHLIST_RANGE);
}

export async function listWatchItems(): Promise<WatchItem[]> {
  const rows = await fetchGrid();
  return rows
    .slice(1) // header
    .filter((r) => (r[0] ?? "").trim() !== "")
    .map(fromRow);
}

export async function addWatchItem(item: WatchItem): Promise<WatchItem> {
  await ensureHeaders();
  await appendRow(sheetId(), WATCHLIST_RANGE, toRow(item));
  return item;
}

/** Rewrites one row in place, locating it via `resolveRowNumber`. */
export async function updateWatchItem(item: WatchItem): Promise<void> {
  const rows = await fetchGrid();
  const rowNumber = resolveRowNumber(rows, item.id);
  if (rowNumber === null) throw new Error(`Watch item ${item.id} not found`);
  await updateRange(sheetId(), `A${rowNumber}:Q${rowNumber}`, [toRow(item)]);
}
