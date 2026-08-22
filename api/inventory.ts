import type { IncomingMessage, ServerResponse } from "node:http";
import {
  listInventoryItems,
  addInventoryItem,
  patchInventoryItem,
  findByRelease,
  newInventoryId,
  type InventoryItem,
} from "../src/inventory.js";
import { getRelease, getMasterVersions, searchRelease } from "../src/discogs.js";
import { planPressings, AUTO_WATCH_LIMIT } from "../src/pressings.js";
import { publicSheetsError } from "../src/sheets.js";

const MAX_QUERY_LENGTH = 200;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

class MalformedBodyError extends Error {}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
  } catch {
    throw new MalformedBodyError("Malformed JSON body");
  }
}

/** Config-guidance messages (missing env vars) carry no secret and are how an
 *  operator diagnoses a broken deploy, so they pass through verbatim. Every
 *  other error, which may embed a spreadsheet id or service-account email,
 *  is replaced with a generic body after being logged server-side. */
function publicErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Inventory API error: ${message}`);
  if (/^(DISCOGS_TOKEN|GOOGLE_|INVENTORY_SHEET_ID)/.test(message)) return message;
  const sheets = publicSheetsError(message);
  if (sheets) return sheets;
  return "Request failed. Check the server logs.";
}

function isValidThreshold(v: number): boolean {
  return Number.isFinite(v) && v >= 0;
}

/** Reads an optional nullable-number field off the PATCH body. Returns
 *  undefined when absent, null to clear, the number when valid, and throws
 *  a field-named error otherwise. */
function nullableNumber(
  body: Record<string, unknown>,
  field: string,
  opts: { integer?: boolean } = {},
): number | null | undefined {
  const v = body[field];
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "number" || !isValidThreshold(v) || (opts.integer && !Number.isInteger(v))) {
    throw new MalformedBodyError(
      `${field} must be a ${opts.integer ? "non-negative integer" : "finite number >= 0"} or null`,
    );
  }
  return v;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === "GET") {
      // The sheet id rides along so the page can link straight to it. It is not
      // a credential. The sheet is only readable by whoever Google has already
      // granted access to, but it does name the document, so it goes out only
      // on this authenticated-by-obscurity POC surface.
      const sheetIdEnv = process.env.INVENTORY_SHEET_ID;
      json(res, 200, {
        items: await listInventoryItems(),
        sheetUrl: sheetIdEnv ? `https://docs.google.com/spreadsheets/d/${sheetIdEnv}/edit` : null,
      });
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);

      // Two ways in: the desk knows the release it priced, Add records only
      // has what the user typed. Free text is resolved the same way a search
      // run resolves it, so both paths agree on what "best match" means.
      let releaseId: number;
      if (typeof body.query === "string" && body.query.trim() !== "") {
        const query = body.query.trim().slice(0, MAX_QUERY_LENGTH);
        const hit = await searchRelease(query);
        if (!hit) {
          json(res, 404, { error: `No vinyl release found on Discogs for "${query}"` });
          return;
        }
        releaseId = hit.id;
      } else {
        releaseId = Number(body.releaseId);
        if (!Number.isFinite(releaseId) || releaseId <= 0) {
          json(res, 400, { error: "releaseId or query is required" });
          return;
        }
      }

      // A title already on the shelf, already watched, or removed earlier gets
      // its watch switched on rather than a second row. Two rows for one
      // record would double every sweep's work while splitting its threshold.
      const existing = findByRelease(await listInventoryItems(), releaseId);
      if (existing) {
        const wasWatching = existing.active && existing.watching;
        const item = wasWatching
          ? existing
          : await patchInventoryItem(existing.id, { watching: true, active: true });
        json(res, 200, { item, existed: true, wasWatching });
        return;
      }

      const meta = await getRelease(releaseId);
      const master = meta.masterId
        ? await getMasterVersions(meta.masterId)
        : { total: 0, versions: [] };
      const plan = planPressings(master.versions, master.total, AUTO_WATCH_LIMIT, releaseId);

      const item: InventoryItem = {
        id: newInventoryId(),
        artist: meta.artist,
        album: meta.title,
        releaseId,
        condition: "",
        qty: 0,
        minQty: null,
        shelfPriceMxn: null,
        landedCostMxn: null,
        maxLandedMxn: null,
        watching: true,
        addedAt: new Date().toISOString(),
        notes: "",
        thumbUrl: meta.coverImage ?? "",
        year: meta.year,
        alertSms: false,
        lastPurchasedAt: "",
        masterId: meta.masterId,
        watchedReleaseIds: plan.needsUserSelection ? [releaseId] : plan.releaseIds,
        pressingScope: plan.scope,
        pressingCount: plan.totalVinylVersions,
        lastCheckedAt: null,
        bestLandedMxn: null,
        bestReleaseId: null,
        status: "watching",
        active: true,
      };

      await addInventoryItem(item);
      json(res, 200, { item, plan });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (typeof body.id !== "string" || body.id.trim() === "") {
        json(res, 400, { error: "id is required" });
        return;
      }

      const patch: Partial<InventoryItem> = {};

      const qty = nullableNumber(body, "qty", { integer: true });
      if (qty !== undefined) {
        if (qty === null) {
          json(res, 400, { error: "qty cannot be null" });
          return;
        }
        patch.qty = qty;
      }

      const minQty = nullableNumber(body, "minQty", { integer: true });
      if (minQty !== undefined) patch.minQty = minQty;

      const maxLandedMxn = nullableNumber(body, "maxLandedMxn");
      if (maxLandedMxn !== undefined) patch.maxLandedMxn = maxLandedMxn;

      const shelfPriceMxn = nullableNumber(body, "shelfPriceMxn");
      if (shelfPriceMxn !== undefined) patch.shelfPriceMxn = shelfPriceMxn;

      if (typeof body.watching === "boolean") {
        patch.watching = body.watching;
        // A record watched again later should alert on its next crossing,
        // not stay marked as already alerted from a previous life.
        if (!body.watching) patch.status = "watching";
      }
      if (typeof body.alertSms === "boolean") patch.alertSms = body.alertSms;
      if (typeof body.active === "boolean") patch.active = body.active;

      try {
        json(res, 200, { item: await patchInventoryItem(body.id, patch) });
      } catch (err) {
        if (err instanceof Error && /not found$/.test(err.message)) {
          json(res, 404, { error: "Not found" });
          return;
        }
        throw err;
      }
      return;
    }

    json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    if (err instanceof MalformedBodyError) {
      json(res, 400, { error: err.message });
      return;
    }
    json(res, 500, { error: publicErrorMessage(err) });
  }
}
