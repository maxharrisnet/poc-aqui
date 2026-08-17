import type { IncomingMessage, ServerResponse } from "node:http";
import { runDemo, runSearch, MAX_QUERIES } from "../src/run.js";

/**
 * Server-Sent Events endpoint.
 *
 * Uses the classic Node (req, res) handler signature rather than the
 * Web-standard (Request) => Response form. Both work under zero-config, but
 * @vercel/node in a legacy `builds` setup expects this one — and vercel.json
 * declares builds explicitly to stop the backends detector taking over.
 *
 * Streaming needs no special runtime: res.write() on the default Node.js
 * runtime is all SSE requires.
 *
 * A ten-record search is ~30 Discogs calls paced at 1.1s, so roughly 35
 * seconds; the demo list is ~18.
 */
export const maxDuration = 60;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const mode = url.searchParams.get("mode") === "search" ? "search" : "demo";
  const queries = url.searchParams.getAll("q").slice(0, MAX_QUERIES);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Stops any proxy buffering the response, which would defeat streaming
    // and leave the page blank until the whole run finished.
    "X-Accel-Buffering": "no",
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (mode === "search" && queries.length === 0) {
      throw new Error("No search terms provided");
    }

    const summary =
      mode === "search"
        ? await runSearch(
            queries,
            (e) => send("progress", e),
            (r) => send("result", r),
          )
        : await runDemo(
            (e) => send("progress", e),
            (r) => send("result", r),
          );

    send("done", summary);
  } catch (err) {
    send("failed", { error: (err as Error).message });
  } finally {
    res.end();
  }
}
