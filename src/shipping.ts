/**
 * Shipping estimates by origin, for a single vinyl LP in a padded mailer
 * (~0.5kg). Per the spec (§7), these start from published carrier rate
 * ranges and get refined by observed actuals from real purchases. There
 * are no actuals yet, so every estimate here is "low" confidence. That is
 * the honest state for a PoC and should be shown as such, not hidden.
 *
 * These are ILLUSTRATIVE, not sourced from a live carrier rate API. A real
 * Phase 1 build would call a carrier or shipping-aggregator API per quote.
 */

export interface ShippingEstimate {
  usd: number;
  confidence: "low" | "medium" | "high";
  note: string;
}

const ESTIMATES_BY_ORIGIN: Record<string, ShippingEstimate> = {
  MX: { usd: 0, confidence: "high", note: "Domestic, no international shipping leg" },

  // North America: shortest lanes
  US: { usd: 12, confidence: "low", note: "Illustrative: shortest lane, economy tracked parcel" },
  CA: { usd: 15, confidence: "low", note: "Illustrative: economy tracked parcel, Canada to Mexico" },

  // Europe
  DE: { usd: 18, confidence: "low", note: "Illustrative: economy tracked parcel, Germany to Mexico" },
  GB: { usd: 19, confidence: "low", note: "Illustrative: economy tracked parcel, UK to Mexico" },
  NL: { usd: 18, confidence: "low", note: "Illustrative: economy tracked parcel, Netherlands to Mexico" },
  FR: { usd: 19, confidence: "low", note: "Illustrative: economy tracked parcel, France to Mexico" },
  IT: { usd: 20, confidence: "low", note: "Illustrative: economy tracked parcel, Italy to Mexico" },
  ES: { usd: 19, confidence: "low", note: "Illustrative: economy tracked parcel, Spain to Mexico" },
  BE: { usd: 18, confidence: "low", note: "Illustrative: economy tracked parcel, Belgium to Mexico" },
  SE: { usd: 21, confidence: "low", note: "Illustrative: economy tracked parcel, Sweden to Mexico" },
  CH: { usd: 21, confidence: "low", note: "Illustrative: economy tracked parcel, Switzerland to Mexico" },
  AT: { usd: 20, confidence: "low", note: "Illustrative: economy tracked parcel, Austria to Mexico" },
  PT: { usd: 20, confidence: "low", note: "Illustrative: economy tracked parcel, Portugal to Mexico" },
  IE: { usd: 20, confidence: "low", note: "Illustrative: economy tracked parcel, Ireland to Mexico" },

  // Latin America: regional
  BR: { usd: 22, confidence: "low", note: "Illustrative: regional lane, Brazil to Mexico" },
  AR: { usd: 23, confidence: "low", note: "Illustrative: regional lane, Argentina to Mexico" },
  CO: { usd: 17, confidence: "low", note: "Illustrative: regional lane, Colombia to Mexico" },
  PE: { usd: 19, confidence: "low", note: "Illustrative: regional lane, Peru to Mexico" },
  CL: { usd: 21, confidence: "low", note: "Illustrative: regional lane, Chile to Mexico" },

  // Asia-Pacific: longest lanes
  JP: { usd: 28, confidence: "low", note: "Illustrative: longest lane, economy tracked parcel" },
  AU: { usd: 30, confidence: "low", note: "Illustrative: longest lane, Australia to Mexico" },
  NZ: { usd: 31, confidence: "low", note: "Illustrative: longest lane, New Zealand to Mexico" },
};

const FALLBACK: ShippingEstimate = {
  usd: 22,
  confidence: "low",
  note: "No origin-specific estimate on file: generic international economy rate used",
};

export function estimateShippingUsd(originCountry: string): ShippingEstimate {
  return ESTIMATES_BY_ORIGIN[originCountry] ?? FALLBACK;
}
