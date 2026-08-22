import type { IncomingMessage, ServerResponse } from "node:http";
import {
  listWatchItems,
  addWatchItem,
  updateWatchItem,
  newWatchId,
  type WatchItem,
} from "../src/watchlist.js";
import { getRelease, getMasterVersions, searchRelease } from "../src/discogs.js";
import { planPressings, AUTO_WATCH_LIMIT } from "../src/pressings.js";

const MAX_WATCHED_RELEASE_IDS = 200;
const MAX_MIN_CONDITION_LENGTH = 32;
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

/** A landed-cost threshold must be a real, non-negative number: NaN or
 *  Infinity would either compare as always-alerted or never-alerted. */
function isValidThreshold(v: number): boolean {
  return Number.isFinite(v) && v >= 0;
}

/** Config-guidance messages (missing env vars) carry no secret and are how an
 *  operator diagnoses a broken deploy, so they pass through verbatim. Every
 *  other error, which may embed a spreadsheet id or service-account email:
 *  is replaced with a generic body after being logged server-side. */
function publicErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Watchlist API error: ${message}`);
  // Config guidance carries no secrets and is how an operator diagnoses a
  // broken deploy: pass it through rather than hiding it behind the log.
  if (/^(DISCOGS_TOKEN|GOOGLE_|WATCHLIST_SHEET_ID|INVENTORY_SHEET_ID)/.test(message)) return message;
  return "Request failed. Check the server logs.";
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === "GET") {
      // The sheet id rides along so the page can link straight to it. It is not
      // a credential. The sheet is only readable by whoever Google has already
      // granted access to, but it does name the document, so it goes out only
      // on this authenticated-by-obscurity POC surface.
      const sheetId = process.env.WATCHLIST_SHEET_ID;
      json(res, 200, {
        items: await listWatchItems(),
        sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : null,
      });
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);

      // Two ways in: the desk knows the release it priced, the watchlist page
      // only has what the user typed. Free text is resolved the same way a
      // search run resolves it, so both paths agree on what "best match" means.
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

      // Typing the same record twice is easy, and a second row for it would
      // double every sweep's work while splitting its threshold in two. Report
      // the existing item instead of appending a duplicate.
      const existingWatch = (await listWatchItems()).find(
        (w) => w.active && w.watchedReleaseIds.includes(releaseId),
      );
      if (existingWatch) {
        json(res, 200, { item: existingWatch, duplicate: true });
        return;
      }

      let maxLandedMxn: number | null = null;
      if (body.maxLandedMxn !== undefined && body.maxLandedMxn !== null) {
        if (typeof body.maxLandedMxn !== "number" || !isValidThreshold(body.maxLandedMxn)) {
          json(res, 400, { error: "maxLandedMxn must be a finite number >= 0" });
          return;
        }
        maxLandedMxn = body.maxLandedMxn;
      }

      const minCondition =
        typeof body.minCondition === "string" ? body.minCondition.slice(0, MAX_MIN_CONDITION_LENGTH) : "";

      const meta = await getRelease(releaseId);
      const master = meta.masterId
        ? await getMasterVersions(meta.masterId)
        : { total: 0, versions: [] };
      const plan = planPressings(master.versions, master.total, AUTO_WATCH_LIMIT, releaseId);

      const item: WatchItem = {
        id: newWatchId(),
        artist: meta.artist,
        album: meta.title,
        masterId: meta.masterId,
        watchedReleaseIds: plan.needsUserSelection ? [releaseId] : plan.releaseIds,
        pressingScope: plan.scope,
        pressingCount: plan.totalVinylVersions,
        maxLandedMxn,
        minCondition,
        priority: "normal",
        active: true,
        addedAt: new Date().toISOString(),
        lastCheckedAt: null,
        bestLandedMxn: null,
        bestReleaseId: null,
        status: "watching",
        notes: "",
        alertSms: false,
      };

      await addWatchItem(item);
      json(res, 200, { item, plan });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const items = await listWatchItems();
      const existing = items.find((w) => w.id === body.id);
      if (!existing) {
        json(res, 404, { error: "Not found" });
        return;
      }

      let maxLandedMxn = existing.maxLandedMxn;
      if (body.maxLandedMxn !== undefined) {
        if (body.maxLandedMxn === null) {
          maxLandedMxn = null;
        } else if (typeof body.maxLandedMxn !== "number" || !isValidThreshold(body.maxLandedMxn)) {
          json(res, 400, { error: "maxLandedMxn must be a finite number >= 0" });
          return;
        } else {
          maxLandedMxn = body.maxLandedMxn;
        }
      }

      let watchedReleaseIds = existing.watchedReleaseIds;
      if (Array.isArray(body.watchedReleaseIds)) {
        if (body.watchedReleaseIds.length > MAX_WATCHED_RELEASE_IDS) {
          json(res, 400, { error: `watchedReleaseIds cannot exceed ${MAX_WATCHED_RELEASE_IDS} entries` });
          return;
        }
        watchedReleaseIds = body.watchedReleaseIds.map(Number).filter((n) => Number.isFinite(n) && n > 0);
      }

      const updated: WatchItem = {
        ...existing,
        active: typeof body.active === "boolean" ? body.active : existing.active,
        alertSms: typeof body.alertSms === "boolean" ? body.alertSms : existing.alertSms,
        maxLandedMxn,
        watchedReleaseIds,
      };
      await updateWatchItem(updated);
      json(res, 200, { item: updated });
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
