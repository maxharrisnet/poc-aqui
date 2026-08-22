import { WATCHLIST } from "./releases.js";
import { searchRelease, getRelease, getMarketplaceStats } from "./discogs.js";
import { fetchFxSnapshot, type FxSnapshot } from "./fx.js";
import { estimateShippingUsd } from "./shipping.js";
import { calculateCustoms, CUSTOMS_RULES_2026 } from "./customsRules.js";
import { resolveOrigin } from "./countries.js";
import {
  listInventoryItems,
  patchInventoryItem,
  sweepReleaseIds,
  type InventoryItem,
} from "./inventory.js";

export const MAX_QUERIES = 10;

/** Items per sweep. At ~2 Discogs calls per pressing and 1.1s pacing, this
 *  keeps a run inside the 300s function ceiling with headroom. */
export const MAX_SWEEP_ITEMS = Number(process.env.MAX_SWEEP_ITEMS ?? 12);

export interface CostBreakdown {
  recordUsd: number;
  shippingUsd: number;
  dutyUsd: number;
  ivaUsd: number;
  totalUsd: number;
}

export interface CheckResult {
  /** What the user asked for. The search text, or the record's own note. */
  requested: string;
  /** Why this record is in the demo set. Absent for user searches. */
  note?: string;
  matched: boolean;
  unmatchedReason?: string;

  discogsId?: number;
  artist?: string;
  title?: string;
  year?: number | null;
  coverImage?: string | null;
  labels?: { name: string; catno: string }[];
  format?: string;
  genres?: string[];
  styles?: string[];
  releaseUrl?: string;
  buyUrl?: string;

  originIso?: string;
  originLabel?: string;
  originApproximate?: boolean;

  available: boolean;
  numForSale: number;
  cost?: CostBreakdown;
  totalMxn?: number;
  customsRuleApplied?: string;
  requiresFormalEntry?: boolean;
  shippingConfidence?: "low" | "medium" | "high";
  shippingNote?: string;

  /** Present when this sweep crossed the record's threshold and SMS alerting
   *  is switched on for it. v0.3 does not send anything. The interface shows
   *  the message that would go out, so the team can see and agree the wording
   *  before a real gateway is wired in. */
  alert?: { channel: "sms"; to: string; message: string };
}

export interface RunSummary {
  generatedAt: string;
  mode: "demo" | "search" | "watchlist";
  fx: FxSnapshot;
  results: CheckResult[];
  totals: {
    recordsUsd: number;
    shippingUsd: number;
    importUsd: number;
    totalUsd: number;
    overheadPct: number;
  };
  customsRuleVersion: string;
  customsBrokerValidated: boolean;
}

export type ProgressFn = (event: { index: number; total: number; label: string }) => void;

/** A sheet write failing must not discard results we already paid Discogs for. */
async function safePatch(id: string, patch: Partial<InventoryItem>): Promise<void> {
  try {
    await patchInventoryItem(id, patch);
  } catch (err) {
    console.error(`Inventory write failed for ${id}: ${(err as Error).message}`);
  }
}

/** Who a simulated alert is addressed to. A real gateway would read the team's
 *  numbers from configuration; the demo needs something to show on screen. */
const ALERT_RECIPIENT = process.env.ALERT_SMS_TO ?? "the buying desk";

function composeAlert(item: InventoryItem, best: CheckResult): NonNullable<CheckResult["alert"]> {
  const price = best.totalMxn == null ? "" : ` at ${Math.round(best.totalMxn).toLocaleString("en-US")} MXN landed`;
  const limit = item.maxLandedMxn == null ? "" : ` (under your ${Math.round(item.maxLandedMxn).toLocaleString("en-US")} limit)`;
  return {
    channel: "sms",
    to: ALERT_RECIPIENT,
    message: `Aqui Ahora: ${item.artist}: ${item.album}${price}${limit}.`,
  };
}

/** Turns a resolved release id into a fully costed result.
 *
 *  Exported because the inventory page prices one release at a time, on demand,
 *  rather than sweeping a list. Same two Discogs calls, same customs ruleset,
 *  same FX snapshot: a figure quoted on the shelf has to be the figure the
 *  buying desk would quote, or the two pages disagree in front of a customer. */
export async function costRelease(
  discogsId: number,
  requested: string,
  fx: FxSnapshot,
  note?: string,
  originOverrideIso?: string,
): Promise<CheckResult> {
  const meta = await getRelease(discogsId);
  const stats = await getMarketplaceStats(discogsId);

  const origin = resolveOrigin(meta.country ?? undefined);
  const iso = originOverrideIso ?? origin.iso;
  const shipping = estimateShippingUsd(iso);

  const base: CheckResult = {
    requested,
    ...(note !== undefined ? { note } : {}),
    matched: true,
    discogsId,
    artist: meta.artist,
    title: meta.title,
    year: meta.year,
    coverImage: meta.coverImage,
    labels: meta.labels,
    format: meta.format,
    genres: meta.genres,
    styles: meta.styles,
    releaseUrl: meta.releaseUrl,
    buyUrl: meta.buyUrl,
    originIso: iso,
    originLabel: originOverrideIso ? iso : origin.label,
    originApproximate: originOverrideIso ? false : origin.approximate,
    available: false,
    numForSale: stats.num_for_sale,
    shippingConfidence: shipping.confidence,
    shippingNote: shipping.note,
  };

  const recordUsd = stats.lowest_price?.value ?? null;
  if (recordUsd === null || stats.num_for_sale === 0) {
    return base;
  }

  const customs = calculateCustoms(iso, recordUsd, shipping.usd, CUSTOMS_RULES_2026);
  const totalUsd = recordUsd + shipping.usd + customs.dutyUsd + customs.ivaUsd;

  return {
    ...base,
    available: true,
    cost: {
      recordUsd,
      shippingUsd: shipping.usd,
      dutyUsd: customs.dutyUsd,
      ivaUsd: customs.ivaUsd,
      totalUsd,
    },
    totalMxn: totalUsd * fx.ratesToMxn.USD,
    customsRuleApplied: customs.ruleApplied,
    requiresFormalEntry: customs.requiresFormalEntry,
  };
}

function summarise(
  mode: "demo" | "search" | "watchlist",
  fx: FxSnapshot,
  results: CheckResult[],
): RunSummary {
  const costed = results.filter((r) => r.cost);
  const recordsUsd = costed.reduce((s, r) => s + r.cost!.recordUsd, 0);
  const shippingUsd = costed.reduce((s, r) => s + r.cost!.shippingUsd, 0);
  const importUsd = costed.reduce((s, r) => s + r.cost!.dutyUsd + r.cost!.ivaUsd, 0);
  const totalUsd = recordsUsd + shippingUsd + importUsd;

  return {
    generatedAt: new Date().toISOString(),
    mode,
    fx,
    results,
    totals: {
      recordsUsd,
      shippingUsd,
      importUsd,
      totalUsd,
      overheadPct: totalUsd > 0 ? ((shippingUsd + importUsd) / totalUsd) * 100 : 0,
    },
    customsRuleVersion: CUSTOMS_RULES_2026.version,
    customsBrokerValidated: CUSTOMS_RULES_2026.brokerValidated,
  };
}

/** The curated demo list: release ids already known, so no search step. */
export async function runDemo(onProgress?: ProgressFn, onResult?: (r: CheckResult) => void): Promise<RunSummary> {
  const fx = await fetchFxSnapshot();
  const results: CheckResult[] = [];

  for (const [i, entry] of WATCHLIST.entries()) {
    onProgress?.({ index: i + 1, total: WATCHLIST.length, label: `${entry.artist}: ${entry.title}` });
    try {
      const result = await costRelease(
        entry.discogsId,
        `${entry.artist}: ${entry.title}`,
        fx,
        entry.note,
        entry.originCountry,
      );
      results.push(result);
      onResult?.(result);
    } catch (err) {
      const failed: CheckResult = {
        requested: `${entry.artist}: ${entry.title}`,
        matched: false,
        unmatchedReason: (err as Error).message,
        available: false,
        numForSale: 0,
      };
      results.push(failed);
      onResult?.(failed);
    }
  }

  return summarise("demo", fx, results);
}

/** Free-text queries typed by the user, capped at MAX_QUERIES. */
export async function runSearch(
  queries: string[],
  onProgress?: ProgressFn,
  onResult?: (r: CheckResult) => void,
): Promise<RunSummary> {
  const cleaned = queries.map((q) => q.trim()).filter(Boolean).slice(0, MAX_QUERIES);
  const fx = await fetchFxSnapshot();
  const results: CheckResult[] = [];

  for (const [i, query] of cleaned.entries()) {
    onProgress?.({ index: i + 1, total: cleaned.length, label: query });
    try {
      const hit = await searchRelease(query);
      if (!hit) {
        const miss: CheckResult = {
          requested: query,
          matched: false,
          unmatchedReason: "No vinyl release found on Discogs for this search",
          available: false,
          numForSale: 0,
        };
        results.push(miss);
        onResult?.(miss);
        continue;
      }
      const result = await costRelease(hit.id, query, fx);
      results.push(result);
      onResult?.(result);
    } catch (err) {
      const failed: CheckResult = {
        requested: query,
        matched: false,
        unmatchedReason: (err as Error).message,
        available: false,
        numForSale: 0,
      };
      results.push(failed);
      onResult?.(failed);
    }
  }

  return summarise("search", fx, results);
}

export interface SweepOutcome {
  result: CheckResult;
  /** Pressings actually priced. Fewer than asked when Discogs failed on some. */
  checked: number;
  /** The cheapest copy landed at or under the record's alert price. */
  under: boolean;
  /** The row as written back. */
  item: InventoryItem;
}

/**
 * Prices every watched pressing of one record, keeps the cheapest, and writes
 * what it found back to the row.
 *
 * One function for both callers on purpose. The Check listings button on an
 * inventory row and the scheduled sweep have to land on the same number, or
 * the figure a person saw at the counter is not the figure the alert fired on.
 */
export async function sweepRecord(item: InventoryItem, fx: FxSnapshot): Promise<SweepOutcome> {
  const label = `${item.artist}: ${item.album}`;
  const releaseIds = sweepReleaseIds(item);
  const checkedAt = new Date().toISOString();

  let best: CheckResult | null = null;
  let checkError: string | null = null;
  let checked = 0;

  for (const releaseId of releaseIds) {
    try {
      const result = await costRelease(releaseId, label, fx, item.notes || undefined);
      checked += 1;
      if (result.cost && (!best?.cost || result.cost.totalUsd < best.cost.totalUsd)) {
        best = result;
      }
    } catch (err) {
      // Remember why, but keep trying the other pressings.
      checkError = (err as Error).message;
    }
  }

  if (best) {
    const under =
      best.totalMxn != null && item.maxLandedMxn != null && best.totalMxn <= item.maxLandedMxn;
    // Only on the crossing, not on every sweep of an already-alerted record:
    // a nightly re-alert for the same copy is how a team learns to ignore the
    // channel.
    if (under && item.alertSms && item.status !== "alerted") {
      best.alert = composeAlert(item, best);
    }
    const patch: Partial<InventoryItem> = {
      lastCheckedAt: checkedAt,
      bestLandedMxn: best.totalMxn ?? null,
      bestReleaseId: best.discogsId ?? null,
      status: under ? "alerted" : "watching",
    };
    await safePatch(item.id, patch);
    return { result: best, checked, under, item: { ...item, ...patch } };
  }

  if (checkError) {
    // Could not reach Discogs. Record that we tried; change nothing else.
    // Nulling the stored best price here would destroy a real alert.
    const failed: CheckResult = {
      requested: label,
      matched: false,
      unmatchedReason: checkError,
      available: false,
      numForSale: 0,
    };
    const patch: Partial<InventoryItem> = { lastCheckedAt: checkedAt };
    await safePatch(item.id, patch);
    return { result: failed, checked, under: false, item: { ...item, ...patch } };
  }

  // Genuinely checked, genuinely nothing listed. Or nothing to check at all.
  const none: CheckResult = {
    requested: label,
    matched: false,
    unmatchedReason:
      releaseIds.length === 0
        ? "No Discogs release matched, so there is nothing to price"
        : "No copies listed for any watched pressing",
    available: false,
    numForSale: 0,
  };
  const patch: Partial<InventoryItem> = {
    lastCheckedAt: checkedAt,
    bestLandedMxn: null,
    bestReleaseId: null,
    status: "watching",
  };
  await safePatch(item.id, patch);
  return { result: none, checked, under: false, item: { ...item, ...patch } };
}

/**
 * Sweeps every active record whose watch is on.
 *
 * Writes each record's result back as it completes rather than at the end, so
 * a function timeout costs the tail of the sweep instead of all of it. The
 * sheet doubles as the checkpoint.
 */
export async function runWatched(
  onProgress?: ProgressFn,
  onResult?: (r: CheckResult) => void,
): Promise<RunSummary> {
  const fx = await fetchFxSnapshot();
  const watched = (await listInventoryItems()).filter((i) => i.active && i.watching);
  // Oldest-checked first, never-checked before that, so a capped run always
  // makes progress on the tail instead of re-sweeping the same prefix.
  watched.sort((a, b) => (a.lastCheckedAt ?? "").localeCompare(b.lastCheckedAt ?? ""));
  const items = watched.slice(0, MAX_SWEEP_ITEMS);
  const skipped = watched.length - items.length;
  const results: CheckResult[] = [];

  for (const [i, item] of items.entries()) {
    onProgress?.({ index: i + 1, total: items.length, label: `${item.artist}: ${item.album}` });
    const { result } = await sweepRecord(item, fx);
    results.push(result);
    onResult?.(result);
  }

  if (skipped > 0) {
    const notice: CheckResult = {
      requested: `${skipped} more record${skipped === 1 ? "" : "s"} not checked this run`,
      matched: false,
      unmatchedReason:
        `A sweep is capped at ${MAX_SWEEP_ITEMS} records to stay inside the time limit. ` +
        `The least recently checked are done first, so run it again to continue.`,
      available: false,
      numForSale: 0,
    };
    results.push(notice);
    onResult?.(notice);
  }

  return summarise("watchlist", fx, results);
}
