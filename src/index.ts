import { writeFile } from "node:fs/promises";
import { WATCHLIST } from "./releases.js";
import { getMarketplaceStats } from "./discogs.js";
import { fetchFxSnapshot } from "./fx.js";
import { computeLandedCost, type LandedCostResult } from "./landedCost.js";
import { renderDigest } from "./digest.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`Aqui Ahora — sourcing engine PoC`);
  console.log(`Watching ${WATCHLIST.length} releases\n`);

  console.log("Fetching FX rates (Frankfurter, ECB reference)...");
  const fx = await fetchFxSnapshot();
  console.log(`  1 USD = ${fx.ratesToMxn.USD.toFixed(4)} MXN as of ${fx.date}\n`);

  const results: LandedCostResult[] = [];

  for (const release of WATCHLIST) {
    process.stdout.write(`Checking ${release.artist} — ${release.title}... `);
    try {
      const stats = await getMarketplaceStats(release.discogsId);
      const result = computeLandedCost(release, stats, fx);
      results.push(result);

      if (result.available) {
        console.log(
          `${result.numForSale} for sale, from $${result.priceUsd} USD -> ` +
            `${result.totalMxn!.toFixed(0)} MXN landed`,
        );
      } else {
        console.log("no copies currently listed");
      }
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }

    // Discogs authenticated limit is 60 req/min; one request per release
    // here, so ~1.1s of spacing keeps us comfortably clear of the ceiling.
    await sleep(1100);
  }

  console.log("\nRendering digest...");
  const digest = renderDigest(results, fx);
  const outPath = new URL("../output/digest.md", import.meta.url);
  await writeFile(outPath, digest, "utf-8");
  console.log(`Written to ${outPath.pathname}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
