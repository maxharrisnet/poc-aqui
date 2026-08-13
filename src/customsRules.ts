/**
 * Mexico customs rules — versioned, exactly as the spec requires (§7, §3.3).
 * These are NOT hardcoded into the calculation logic; they live here as a
 * single dated version so a broker can review and correct them without
 * touching the engine. In the real system this is a database table with
 * effective_from/effective_to; here it's one object because the PoC only
 * needs to prove the *shape* of the rule, not the storage mechanism.
 *
 * SOURCES — verified during spec research, NOT confirmed by a customs broker:
 *   - Mexico's 2026 Customs Law: de minimis exemption largely eliminated
 *   - Formal customs entry (licensed broker) required above ~USD $250
 *   - Non-US/Canada courier shipments: ~19% flat "tasa global"
 *   - US/Canada retain limited USMCA de minimis (~USD $50)
 *   - IVA: 16% on customs value + duty + charges
 *
 * DO NOT treat these figures as authoritative for a real purchase decision.
 * This is exactly the caveat that belongs in front of Ian and Gary.
 */

export interface CustomsRuleVersion {
  version: string;
  effectiveFrom: string;
  usmcaOriginCountries: string[];
  usmcaDeMinimisUsd: number;
  tasaGlobalRate: number; // flat rate for non-USMCA courier shipments
  ivaRate: number;
  formalEntryThresholdUsd: number;
  brokerValidated: boolean;
  notes: string;
}

export const CUSTOMS_RULES_2026: CustomsRuleVersion = {
  version: "2026-08-mx-customs-law-v1",
  effectiveFrom: "2026-01-01",
  usmcaOriginCountries: ["US", "CA"],
  usmcaDeMinimisUsd: 50,
  tasaGlobalRate: 0.19,
  ivaRate: 0.16,
  formalEntryThresholdUsd: 250,
  brokerValidated: false,
  notes:
    "Derived from public reporting on Mexico's 2026 Customs Law. Not yet " +
    "confirmed by a licensed customs broker — do not rely on these figures " +
    "for a real purchase decision until validated.",
};

export interface CustomsResult {
  dutyUsd: number;
  ivaUsd: number;
  requiresFormalEntry: boolean;
  ruleApplied: "usmca_de_minimis" | "tasa_global" | "domestic";
}

/**
 * Domestic (Mexico-origin) purchases pass through with no import cost —
 * this is the control case in the watchlist (La Revolución de Emiliano
 * Zapata) that proves the engine is conditional, not a flat markup.
 */
export function calculateCustoms(
  originCountry: string,
  priceUsd: number,
  shippingUsd: number,
  rules: CustomsRuleVersion = CUSTOMS_RULES_2026,
): CustomsResult {
  if (originCountry === "MX") {
    return { dutyUsd: 0, ivaUsd: 0, requiresFormalEntry: false, ruleApplied: "domestic" };
  }

  const customsValue = priceUsd + shippingUsd;
  const requiresFormalEntry = customsValue > rules.formalEntryThresholdUsd;

  if (rules.usmcaOriginCountries.includes(originCountry) && customsValue <= rules.usmcaDeMinimisUsd) {
    return { dutyUsd: 0, ivaUsd: 0, requiresFormalEntry, ruleApplied: "usmca_de_minimis" };
  }

  // Everything else — including USMCA-origin shipments over the de minimis
  // threshold — falls to the simplified courier regime in this PoC. A real
  // USMCA duty schedule by HS code is a broker question, not a default we
  // should silently assume; flagging that explicitly rather than guessing.
  const dutyUsd = customsValue * rules.tasaGlobalRate;
  const ivaUsd = (customsValue + dutyUsd) * rules.ivaRate;

  return { dutyUsd, ivaUsd, requiresFormalEntry, ruleApplied: "tasa_global" };
}
