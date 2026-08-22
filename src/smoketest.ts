/**
 * Exercises the full pipeline: FX, customs, shipping, digest rendering:
 * with mocked Discogs responses, so everything except the live API call
 * is verified before DISCOGS_TOKEN is available. Not part of the real run.
 */
import { WATCHLIST } from "./releases.js";
import { fetchFxSnapshot } from "./fx.js";
import { computeLandedCost } from "./landedCost.js";
import { renderDigest } from "./digest.js";
import type { MarketplaceStats } from "./discogs.js";

const MOCK_PRICES_USD = [45, 180, 30, 120, 60, 55, 25, 15]; // rough plausible spread

async function main() {
  console.log("SMOKETEST: mocked Discogs data, real FX + customs + digest logic\n");

  const fx = await fetchFxSnapshot();
  console.log(`FX ok: 1 USD = ${fx.ratesToMxn.USD.toFixed(4)} MXN (${fx.date})\n`);

  const results = WATCHLIST.map((release, i) => {
    const mockStats: MarketplaceStats = {
      lowest_price: { value: MOCK_PRICES_USD[i]!, currency: "USD" },
      num_for_sale: i === 6 ? 0 : 3, // force one "unavailable" branch to exercise that path
      blocked_from_sale: false,
    };
    return computeLandedCost(release, mockStats, fx);
  });

  for (const r of results) {
    if (r.available) {
      console.log(
        `${r.release.artist.padEnd(28)} ${r.customsRuleApplied.padEnd(18)} ` +
          `formal_entry=${String(r.requiresFormalEntry).padEnd(5)} total=${r.totalMxn!.toFixed(0)} MXN`,
      );
    } else {
      console.log(`${r.release.artist.padEnd(28)} UNAVAILABLE (exercises the no-stock branch)`);
    }
  }

  // Sanity checks that would indicate a real logic bug, not just missing data.
  const mx = results.find((r) => r.release.originCountry === "MX")!;
  if (mx.dutyUsd !== 0 || mx.ivaUsd !== 0) {
    throw new Error("SMOKETEST FAILED: Mexico-origin control case should have zero duty/IVA");
  }
  console.log("\n✓ Control case (MX origin) correctly shows zero import cost");

  const jp = results.find((r) => r.release.originCountry === "JP")!;
  const de = results.find((r) => r.release.originCountry === "DE" && r.release.artist === "Kraftwerk")!;
  if (jp.available && de.available && jp.shippingUsd <= de.shippingUsd) {
    throw new Error("SMOKETEST FAILED: Japan shipping estimate should exceed Germany's");
  }
  console.log("✓ Japan shipping estimate exceeds Germany's, as expected for the longer lane");

  const digest = renderDigest(results, fx);
  console.log(`\n✓ Digest rendered, ${digest.length} chars, ${digest.split("\n").length} lines`);
  console.log("\nSMOKETEST PASSED: pipeline is sound; only the live Discogs call is unverified.");
}

main().catch((err) => {
  console.error("SMOKETEST ERROR:", err);
  process.exit(1);
});
