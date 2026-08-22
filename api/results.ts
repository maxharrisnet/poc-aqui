import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The local dev server keeps the last run in memory so a page reload doesn't
 * re-spend Discogs rate limit. Serverless has no shared memory between
 * invocations, so there is genuinely nothing to hand back. Each visitor runs
 * their own check.
 *
 * Returns null rather than a 404 so the client behaves identically in both
 * environments: it already treats null as "nothing cached, show the idle state".
 */
export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end("null");
}
