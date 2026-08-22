import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_HEADERS,
  INVENTORY_RANGE,
  toRow,
  fromRow,
  resolveRowNumber,
  sweepReleaseIds,
  findByRelease,
  type InventoryItem,
} from "./inventory.js";

const sample: InventoryItem = {
  id: "i_abc123",
  artist: "Basic Channel",
  album: "Q 1.1",
  releaseId: 2164,
  condition: "VG",
  qty: 1,
  minQty: 1,
  shelfPriceMxn: 3200,
  landedCostMxn: 1980,
  maxLandedMxn: 2100,
  watching: true,
  addedAt: "2026-08-12T00:00:00.000Z",
  notes: "Original Berlin 12in",
  thumbUrl: "https://i.discogs.com/x.jpg",
  year: 1993,
  alertSms: true,
  lastPurchasedAt: "2026-08-01T00:00:00.000Z",
  masterId: 1378,
  watchedReleaseIds: [2164, 1074573],
  pressingScope: "all",
  pressingCount: 6,
  lastCheckedAt: "2026-08-21T06:00:00.000Z",
  bestLandedMxn: 1900,
  bestReleaseId: 1074573,
  status: "alerted",
  active: true,
};

test("header count matches row width and the range", () => {
  assert.equal(toRow(sample).length, INVENTORY_HEADERS.length);
  assert.equal(INVENTORY_HEADERS.length, 26);
  assert.equal(INVENTORY_RANGE, "A:Z");
});

test("round-trips through the sheet representation", () => {
  assert.deepEqual(fromRow(toRow(sample)), sample);
});

test("a row written before v0.4 reads as active, watching its own pressing", () => {
  const legacy = toRow(sample).slice(0, 17);
  const item = fromRow(legacy);
  assert.equal(item.active, true);
  assert.equal(item.status, "watching");
  assert.deepEqual(item.watchedReleaseIds, []);
  assert.equal(item.masterId, null);
  assert.equal(item.pressingScope, "all");
  assert.equal(item.pressingCount, 0);
  assert.equal(item.lastCheckedAt, null);
  assert.equal(item.bestLandedMxn, null);
  assert.equal(item.bestReleaseId, null);
  assert.deepEqual(sweepReleaseIds(item), [2164]);
});

test("only an explicit FALSE deactivates a row", () => {
  assert.equal(fromRow(toRow({ ...sample, active: false })).active, false);
  const blank = toRow(sample);
  blank[25] = "";
  assert.equal(fromRow(blank).active, true);
  assert.equal(fromRow([...toRow(sample).slice(0, 25), "false"]).active, false);
});

test("blank optional cells become null, not NaN or empty string", () => {
  const item = fromRow(
    toRow({
      ...sample,
      maxLandedMxn: null,
      masterId: null,
      bestLandedMxn: null,
      bestReleaseId: null,
      lastCheckedAt: null,
    }),
  );
  assert.equal(item.maxLandedMxn, null);
  assert.equal(item.masterId, null);
  assert.equal(item.bestLandedMxn, null);
  assert.equal(item.bestReleaseId, null);
  assert.equal(item.lastCheckedAt, null);
});

test("tolerates short rows, since Sheets omits trailing empty cells", () => {
  const item = fromRow(["i_x", "Artist", "Album"]);
  assert.equal(item.id, "i_x");
  assert.equal(item.qty, 0);
  assert.equal(item.watching, false);
  assert.equal(item.active, true);
  assert.deepEqual(sweepReleaseIds(item), []);
});

test("sweepReleaseIds prefers the watched set over the shelf pressing", () => {
  assert.deepEqual(sweepReleaseIds(sample), [2164, 1074573]);
  assert.deepEqual(sweepReleaseIds({ releaseId: 5, watchedReleaseIds: [] }), [5]);
  assert.deepEqual(sweepReleaseIds({ releaseId: null, watchedReleaseIds: [] }), []);
});

test("findByRelease matches the shelf pressing or any watched pressing", () => {
  const other: InventoryItem = { ...sample, id: "i_other", releaseId: 99, watchedReleaseIds: [] };
  assert.equal(findByRelease([sample, other], 1074573)?.id, "i_abc123");
  assert.equal(findByRelease([sample, other], 99)?.id, "i_other");
  assert.equal(findByRelease([sample, other], 12345), undefined);
});

test("resolveRowNumber returns the true sheet row, not the filtered index", () => {
  // Header, then a, b, BLANK, d, e. Sheets rows are 1-based.
  const grid = [
    ["id", "artist"],
    ["a", "A"],
    ["b", "B"],
    ["", ""],
    ["d", "D"],
    ["e", "E"],
  ];
  assert.equal(resolveRowNumber(grid, "a"), 2);
  assert.equal(resolveRowNumber(grid, "b"), 3);
  // The regression: filtering would put d at index 2 and e at index 3,
  // yielding rows 4 and 5: d's row and, fatally, d's row again for e.
  assert.equal(resolveRowNumber(grid, "d"), 5);
  assert.equal(resolveRowNumber(grid, "e"), 6);
});

test("resolveRowNumber returns null for an unknown id and never matches the header", () => {
  const grid = [["id"], ["a"], ["b"]];
  assert.equal(resolveRowNumber(grid, "zzz"), null);
  assert.equal(resolveRowNumber(grid, "id"), null);
});

test("resolveRowNumber tolerates ragged rows", () => {
  const grid = [["id"], [], ["b"]];
  assert.equal(resolveRowNumber(grid, "b"), 3);
});
