import type { IncomingMessage, ServerResponse } from "node:http";
import {
  listWatchItems,
  addWatchItem,
  updateWatchItem,
  newWatchId,
  type WatchItem,
} from "../src/watchlist.js";
import { getRelease, getMasterVersions } from "../src/discogs.js";
import { planPressings, AUTO_WATCH_LIMIT } from "../src/pressings.js";

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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === "GET") {
      json(res, 200, { items: await listWatchItems() });
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const releaseId = Number(body.releaseId);
      if (!Number.isFinite(releaseId) || releaseId <= 0) {
        json(res, 400, { error: "releaseId is required" });
        return;
      }

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
        maxLandedMxn: typeof body.maxLandedMxn === "number" ? body.maxLandedMxn : null,
        minCondition: typeof body.minCondition === "string" ? body.minCondition : "",
        priority: "normal",
        active: true,
        addedAt: new Date().toISOString(),
        lastCheckedAt: null,
        bestLandedMxn: null,
        bestReleaseId: null,
        status: "watching",
        notes: "",
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
      const updated: WatchItem = {
        ...existing,
        active: typeof body.active === "boolean" ? body.active : existing.active,
        maxLandedMxn:
          typeof body.maxLandedMxn === "number"
            ? body.maxLandedMxn
            : body.maxLandedMxn === null
              ? null
              : existing.maxLandedMxn,
        watchedReleaseIds: Array.isArray(body.watchedReleaseIds)
          ? body.watchedReleaseIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
          : existing.watchedReleaseIds,
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
    json(res, 500, { error: (err as Error).message });
  }
}
