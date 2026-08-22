import type { LandedCostResult } from "./landedCost.js";
import type { FxSnapshot } from "./fx.js";
import { CUSTOMS_RULES_2026 } from "./customsRules.js";

const fmt = (n: number, ccy: string) =>
  `${ccy} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Renders exactly what would be appended to Ian's Google Doc digest (spec
 * §8.1). This PoC writes Markdown to a file instead of calling the Google
 * Docs API. The API call itself is a small, mechanical piece of Phase 1
 * work; what needed proving here is the sourcing and cost logic upstream
 * of it, not the delivery mechanism.
 */
export function renderDigest(results: LandedCostResult[], fx: FxSnapshot): string {
  const available = results.filter((r) => r.available);
  const unavailable = results.filter((r) => !r.available);
  const sorted = [...available].sort((a, b) => (a.totalMxn ?? 0) - (b.totalMxn ?? 0));
  const formalEntry = available.filter((r) => r.requiresFormalEntry);

  const lines: string[] = [];

  lines.push(`# Aqui Ahora: Sourcing Digest (Proof of Concept)`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
  lines.push(`FX date: ${fx.date} · Source: Frankfurter (ECB reference rates)`);
  lines.push(
    `Customs rules: \`${CUSTOMS_RULES_2026.version}\`, **not yet broker-validated, ` +
      `see caveat at the foot of this document**`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  lines.push(`## Sorted by landed cost (${sorted.length} of ${results.length} available)`);
  lines.push("");
  lines.push("| Landed (MXN) | Artist: Title | Origin | Price | Shipping | Duty+IVA | Formal entry? |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of sorted) {
    const flag = r.requiresFormalEntry ? "⚠️ yes" : "no";
    lines.push(
      `| **${fmt(r.totalMxn!, "MXN")}** | ${r.release.artist}: ${r.release.title} | ` +
        `${r.release.originCountry} | ${fmt(r.priceUsd!, "USD")} | ${fmt(r.shippingUsd, "USD")} | ` +
        `${fmt(r.dutyUsd + r.ivaUsd, "USD")} | ${flag} |`,
    );
  }
  lines.push("");

  if (formalEntry.length > 0) {
    lines.push(`### ⚠️ Formal entry required (${formalEntry.length})`);
    lines.push("");
    lines.push(
      `Crosses the ${CUSTOMS_RULES_2026.formalEntryThresholdUsd} USD threshold. This needs a ` +
        `licensed broker and will take longer, not just cost more.`,
    );
    lines.push("");
    for (const r of formalEntry) {
      lines.push(`- ${r.release.artist}: ${r.release.title} (${fmt(r.totalMxn!, "MXN")} landed)`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Full breakdown");
  lines.push("");
  for (const r of sorted) {
    lines.push(`### ${r.release.artist}: ${r.release.title} (${r.release.year})`);
    lines.push("");
    lines.push(`*${r.release.note}*`);
    lines.push("");
    lines.push(`- **${r.numForSale}** copies for sale on Discogs, from ${r.release.originCountry}`);
    lines.push(`- Lowest listed price: ${fmt(r.priceUsd!, "USD")}`);
    lines.push(
      `- Shipping estimate: ${fmt(r.shippingUsd, "USD")} (confidence: ${r.shippingConfidence}: ` +
        `illustrative, not a live carrier quote)`,
    );
    lines.push(`- Customs rule applied: \`${r.customsRuleApplied}\``);
    lines.push(`- Duty: ${fmt(r.dutyUsd, "USD")} · IVA: ${fmt(r.ivaUsd, "USD")}`);
    lines.push(`- **Total landed: ${fmt(r.totalUsd!, "USD")} → ${fmt(r.totalMxn!, "MXN")}**`);
    lines.push("");
  }

  if (unavailable.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push(`## No copies currently listed (${unavailable.length})`);
    lines.push("");
    for (const r of unavailable) {
      lines.push(`- ${r.release.artist}: ${r.release.title}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Caveats: read before trusting these numbers");
  lines.push("");
  lines.push(
    "- **Customs rules are not broker-validated.** Figures come from public reporting on " +
      "Mexico's 2026 Customs Law, not a licensed broker. See §3.2 of the technical spec.",
  );
  lines.push(
    "- **Shipping is illustrative**, not a live carrier quote. The real system refines this " +
      "from actual purchase data over time (spec §7).",
  );
  lines.push(
    "- **This is one snapshot in time**, not continuous monitoring. Phase 1 polls automatically " +
      "and only surfaces genuinely new or below-threshold hits.",
  );
  lines.push(
    "- **No identity resolution beyond the exact release ID**. This PoC does not yet " +
      "attempt to match reissues, repressings or regional variants against each other.",
  );

  return lines.join("\n");
}
