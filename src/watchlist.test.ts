import { test } from "node:test";
import assert from "node:assert/strict";
import { WATCHLIST_HEADERS, toRow, fromRow, resolveRowNumber, type WatchItem } from "./watchlist.js";

const sample: WatchItem = {
  id: "w_abc123",
  artist: "Basic Channel",
  album: "Q 1.1",
  masterId: 1378,
  watchedReleaseIds: [2164, 1074573],
  pressingScope: "all",
  pressingCount: 6,
  maxLandedMxn: 1500,
  minCondition: "VG+",
  priority: "high",
  active: true,
  addedAt: "2026-08-17T10:00:00.000Z",
  lastCheckedAt: null,
  bestLandedMxn: null,
  bestReleaseId: null,
  status: "watching",
  notes: "",
  alertSms: true,
};

test("header count matches row width", () => {
  assert.equal(toRow(sample).length, WATCHLIST_HEADERS.length);
});

test("round-trips through the sheet representation", () => {
  assert.deepEqual(fromRow(toRow(sample)), sample);
});

test("a row written before alert_sms existed reads as alerting off", () => {
  const legacy = toRow(sample).slice(0, 17);
  assert.equal(fromRow(legacy).alertSms, false);
});

test("blank optional cells become null, not NaN or empty string", () => {
  const item = fromRow(toRow({ ...sample, maxLandedMxn: null, masterId: null }));
  assert.equal(item.maxLandedMxn, null);
  assert.equal(item.masterId, null);
});

test("tolerates short rows, since Sheets omits trailing empty cells", () => {
  const item = fromRow(["w_x", "Artist", "Album"]);
  assert.equal(item.id, "w_x");
  assert.equal(item.notes, "");
  assert.equal(item.active, false);
  assert.deepEqual(item.watchedReleaseIds, []);
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
  // yielding rows 4 and 5 — d's row and, fatally, d's row again for e.
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
