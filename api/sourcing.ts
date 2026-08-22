import type { IncomingMessage, ServerResponse } from "node:http";
import { costRelease } from "../src/run.js";
import { fetchFxSnapshot } from "../src/fx.js";

/**
 * Prices one release on demand, for the Sourcing section of an inventory row.
 *
 *   GET /api/sourcing?releaseId=2164&q=Basic%20Channel%20Q%201.1
 *
 * Two Discogs calls, so about 2.2 seconds at the client's pacing. Deliberately
 * one release rather than a list: this is the "check this record now" button,
 * and a person is waiting for it.
 *
 * Only Discogs returns a real price. eBay, Mercado Libre and Bandcamp are
 * search links rather than results, and are labelled that way in the response
 * so the interface cannot quietly present a search as a listing. When those
 * APIs are built, they move from `links` to `offers` and nothing else changes.
 *
 * In the finished system this endpoint is also what a scheduled sweep calls,
 * a few times a day per watched record, instead of a person pressing a button.
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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const releaseId = Number(url.searchParams.get("releaseId"));
  const query = (url.searchParams.get("q") ?? "").trim();

  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    json(res, 400, { error: "releaseId must be a positive whole number" });
    return;
  }

  try {
    const fx = await fetchFxSnapshot();
    const result = await costRelease(releaseId, query || String(releaseId), fx);

    json(res, 200, {
      checkedAt: new Date().toISOString(),
      fxDate: fx.date,
      discogs: {
        available: result.available,
        numForSale: result.numForSale,
        totalMxn: result.totalMxn ?? null,
        cost: result.cost ?? null,
        originLabel: result.originLabel ?? null,
        shippingConfidence: result.shippingConfidence ?? null,
        buyUrl: result.buyUrl ?? null,
        releaseUrl: result.releaseUrl ?? null,
      },
      links: searchLinks(query || String(releaseId)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Sourcing check failed: ${message}`);
    json(res, 500, {
      error: /^DISCOGS_TOKEN/.test(message) ? message : "Could not check listings. See the server logs.",
    });
  }
}
