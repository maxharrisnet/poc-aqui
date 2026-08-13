import type { WatchedRelease } from "./releases.js";
import type { MarketplaceStats } from "./discogs.js";
import type { FxSnapshot } from "./fx.js";
import { estimateShippingUsd } from "./shipping.js";
import { calculateCustoms, CUSTOMS_RULES_2026 } from "./customsRules.js";

export interface LandedCostResult {
  release: WatchedRelease;
  available: boolean;
  numForSale: number;
  priceUsd: number | null;
  shippingUsd: number;
  shippingConfidence: "low" | "medium" | "high";
  dutyUsd: number;
  ivaUsd: number;
  customsRuleApplied: string;
  requiresFormalEntry: boolean;
  totalUsd: number | null;
  totalMxn: number | null;
}

export function computeLandedCost(
  release: WatchedRelease,
  stats: MarketplaceStats,
  fx: FxSnapshot,
): LandedCostResult {
  const priceUsd = stats.lowest_price?.value ?? null;
  const shipping = estimateShippingUsd(release.originCountry);

  if (priceUsd === null || stats.num_for_sale === 0) {
    return {
      release,
      available: false,
      numForSale: stats.num_for_sale,
      priceUsd: null,
      shippingUsd: shipping.usd,
      shippingConfidence: shipping.confidence,
      dutyUsd: 0,
      ivaUsd: 0,
      customsRuleApplied: "n/a",
      requiresFormalEntry: false,
      totalUsd: null,
      totalMxn: null,
    };
  }

  const customs = calculateCustoms(release.originCountry, priceUsd, shipping.usd, CUSTOMS_RULES_2026);
  const totalUsd = priceUsd + shipping.usd + customs.dutyUsd + customs.ivaUsd;
  const totalMxn = totalUsd * fx.ratesToMxn.USD;

  return {
    release,
    available: true,
    numForSale: stats.num_for_sale,
    priceUsd,
    shippingUsd: shipping.usd,
    shippingConfidence: shipping.confidence,
    dutyUsd: customs.dutyUsd,
    ivaUsd: customs.ivaUsd,
    customsRuleApplied: customs.ruleApplied,
    requiresFormalEntry: customs.requiresFormalEntry,
    totalUsd,
    totalMxn,
  };
}
