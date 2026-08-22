import type { IncomingMessage, ServerResponse } from "node:http";
import { sweepRecord } from "../src/run.js";
import { fetchFxSnapshot } from "../src/fx.js";
import { listInventoryItems } from "../src/inventory.js";
import { publicSheetsError } from "../src/sheets.js";

/**
 * Prices one inventory row on demand, for the Sourcing section of that row.
 *
 *   GET /api/sourcing?id=i_abc123
 *
 * Runs the same per-record sweep a scheduled run would, over every watched
 * pressing, and writes the result back to the row. Two Discogs calls per
 * pressing at the client's pacing, so a six-pressing album takes about
 * thirteen seconds. A person is waiting for it, which is why the page says
 * how many pressings it is pricing.
 *
 * Only Discogs returns a real price. eBay, Mercado Libre and Bandcamp are
 * search links rather than results, and are labelled that way in the response
 * so the interface cannot quietly present a search as a listing. When those
 * APIs are built, they move from `links` to `offers` and nothing else changes.
 */

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Search URLs, not listings. Each one opens the platform with the record's
 *  name already typed in, which is what a person does by hand today. */
function searchLinks(query: string): { platform: string; url: string; note: string }[] {
  const q = encodeURIComponent(query);
  // Mercado Libre puts the search in the path, hyphen-separated, and treats a
  // percent-encoded space as part of the term rather than a separator.
  const slug = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return [
    {
      platform: "eBay",
      url: `https://www.ebay.com/sch/i.html?_nkw=${q}+vinyl`,
      note: "Search. The Browse API would return real listings with shipping to Mexico",
    },
    {
      platform: "Mercado Libre",
      url: `https://listado.mercadolibre.com.mx/${slug}-vinilo`,
      note: "Search. Domestic listings, so no import cost at all",
    },
    {
      platform: "Bandcamp",
      url: `https://bandcamp.com/search?q=${q}&item_type=p`,
      note: "Search. No API exists, and no prices are readable programmatically",
    },
  ];
}

/** Same policy as api/inventory.ts: config guidance passes through, everything
 *  else is logged and replaced with a generic body. */
function publicErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Sourcing check failed: ${message}`);
  if (/^(DISCOGS_TOKEN|GOOGLE_|INVENTORY_SHEET_ID)/.test(message)) return message;
  const sheets = publicSheetsError(message);
  if (sheets) return sheets;
  return "Could not check listings. See the server logs.";
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const id = (url.searchParams.get("id") ?? "").trim();

  if (!id) {
    json(res, 400, { error: "id is required" });
    return;
  }

  try {
    const item = (await listInventoryItems()).find((i) => i.id === id);
    if (!item) {
      json(res, 404, { error: "Not found" });
      return;
    }

    const fx = await fetchFxSnapshot();
    const outcome = await sweepRecord(item, fx);
    const r = outcome.result;
    const query = `${item.artist} ${item.album}`.trim() || String(item.releaseId ?? "");

    json(res, 200, {
      checkedAt: outcome.item.lastCheckedAt,
      fxDate: fx.date,
      checked: outcome.checked,
      under: outcome.under,
      discogs: {
        available: r.available,
        numForSale: r.numForSale,
        totalMxn: r.totalMxn ?? null,
        cost: r.cost ?? null,
        originLabel: r.originLabel ?? null,
        shippingConfidence: r.shippingConfidence ?? null,
        buyUrl: r.buyUrl ?? null,
        releaseUrl:
          r.releaseUrl ??
          (item.releaseId ? `https://www.discogs.com/release/${item.releaseId}` : null),
        releaseId: r.discogsId ?? null,
        reason: r.matched ? null : (r.unmatchedReason ?? null),
      },
      alert: r.alert ?? null,
      item: outcome.item,
      links: searchLinks(query),
    });
  } catch (err) {
    json(res, 500, { error: publicErrorMessage(err) });
  }
}
