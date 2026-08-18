import { test } from "node:test";
import assert from "node:assert/strict";
import { WATCHLIST_HEADERS, toRow, fromRow, type WatchItem } from "./watchlist.js";

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
};

test("header count matches row width", () => {
  assert.equal(toRow(sample).length, WATCHLIST_HEADERS.length);
});

test("round-trips through the sheet representation", () => {
  assert.deepEqual(fromRow(toRow(sample)), sample);
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
