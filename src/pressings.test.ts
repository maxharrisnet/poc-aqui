import { test } from "node:test";
import assert from "node:assert/strict";
import { planPressings, AUTO_WATCH_LIMIT } from "./pressings.js";

const versions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    country: "Germany",
    released: "1993",
    format: "LP",
    label: "Basic Channel",
    catno: `BC-${i}`,
  }));

test("watches every pressing when the count is at or under the limit", () => {
  const plan = planPressings(versions(6), 6, AUTO_WATCH_LIMIT);
  assert.equal(plan.scope, "all");
  assert.equal(plan.needsUserSelection, false);
  assert.equal(plan.releaseIds.length, 6);
});

test("requires user selection above the limit", () => {
  const plan = planPressings(versions(100), 143, AUTO_WATCH_LIMIT);
  assert.equal(plan.scope, "selected");
  assert.equal(plan.needsUserSelection, true);
  assert.deepEqual(plan.releaseIds, []);
  assert.equal(plan.totalVinylVersions, 143);
});

test("exactly at the limit still auto-watches", () => {
  const plan = planPressings(versions(AUTO_WATCH_LIMIT), AUTO_WATCH_LIMIT, AUTO_WATCH_LIMIT);
  assert.equal(plan.scope, "all");
});

test("falls back to the single release when there is no master", () => {
  const plan = planPressings([], 0, AUTO_WATCH_LIMIT, 2164);
  assert.equal(plan.scope, "all");
  assert.deepEqual(plan.releaseIds, [2164]);
  assert.equal(plan.totalVinylVersions, 1);
});

test("flags a truncated choice list when the master exceeds one API page", () => {
  // Autobahn: 143 vinyl pressings, but /versions returns at most 100.
  const plan = planPressings(versions(100), 143, AUTO_WATCH_LIMIT);
  assert.equal(plan.choicesTruncated, true);
  assert.equal(plan.choices.length, 100);
  assert.equal(plan.totalVinylVersions, 143);
});

test("does not flag truncation when every pressing fits in one page", () => {
  const plan = planPressings(versions(40), 40, AUTO_WATCH_LIMIT);
  assert.equal(plan.choicesTruncated, false);
});

test("auto-watch and no-master branches are never truncated", () => {
  assert.equal(planPressings(versions(6), 6, AUTO_WATCH_LIMIT).choicesTruncated, false);
  assert.equal(planPressings([], 0, AUTO_WATCH_LIMIT, 2164).choicesTruncated, false);
});

test("release id 0 is treated as a real id, not as absent", () => {
  const plan = planPressings([], 0, AUTO_WATCH_LIMIT, 0);
  assert.deepEqual(plan.releaseIds, [0]);
  assert.equal(plan.totalVinylVersions, 1);
});
