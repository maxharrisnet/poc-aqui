import type { IncomingMessage, ServerResponse } from "node:http";
import {
  listInventoryItems,
  patchInventoryItem,
  type InventoryItem,
} from "../src/inventory.js";

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

/** Same policy as api/watchlist.ts: config guidance passes through, everything
 *  else is logged and replaced with a generic body. */
function publicErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Inventory API error: ${message}`);
  if (/^(DISCOGS_TOKEN|GOOGLE_|WATCHLIST_SHEET_ID|INVENTORY_SHEET_ID)/.test(message)) return message;
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
      const sheetIdEnv = process.env.INVENTORY_SHEET_ID;
      json(res, 200, {
        items: await listInventoryItems(),
        sheetUrl: sheetIdEnv ? `https://docs.google.com/spreadsheets/d/${sheetIdEnv}/edit` : null,
      });
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

      if (typeof body.watching === "boolean") patch.watching = body.watching;
      if (typeof body.alertSms === "boolean") patch.alertSms = body.alertSms;

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
