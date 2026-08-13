import { WATCHLIST } from "./releases.js";
import { searchRelease, getRelease, getMarketplaceStats } from "./discogs.js";
import { fetchFxSnapshot, type FxSnapshot } from "./fx.js";
import { estimateShippingUsd } from "./shipping.js";
import { calculateCustoms, CUSTOMS_RULES_2026 } from "./customsRules.js";
import { resolveOrigin } from "./countries.js";

export const MAX_QUERIES = 10;

export interface CostBreakdown {
  recordUsd: number;
  shippingUsd: number;
  dutyUsd: number;
  ivaUsd: number;
  totalUsd: number;
}

export interface CheckResult {
  /** What the user asked for — the search text, or the watchlist note. */
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
}

export interface RunSummary {
  generatedAt: string;
  mode: "demo" | "search";
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

/** Turns a resolved release id into a fully costed result. */
async function costRelease(
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

function summarise(mode: "demo" | "search", fx: FxSnapshot, results: CheckResult[]): RunSummary {
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

/** The curated demo list — release ids already known, so no search step. */
export async function runDemo(onProgress?: ProgressFn, onResult?: (r: CheckResult) => void): Promise<RunSummary> {
  const fx = await fetchFxSnapshot();
  const results: CheckResult[] = [];

  for (const [i, entry] of WATCHLIST.entries()) {
    onProgress?.({ index: i + 1, total: WATCHLIST.length, label: `${entry.artist} — ${entry.title}` });
    try {
      const result = await costRelease(
        entry.discogsId,
        `${entry.artist} — ${entry.title}`,
        fx,
        entry.note,
        entry.originCountry,
      );
      results.push(result);
      onResult?.(result);
    } catch (err) {
      const failed: CheckResult = {
        requested: `${entry.artist} — ${entry.title}`,
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
