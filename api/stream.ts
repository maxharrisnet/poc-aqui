import { runDemo, runSearch, MAX_QUERIES } from "../src/run.js";

/**
 * Server-Sent Events endpoint, Vercel Function flavour.
 *
 * Streaming works fine on the default Node.js runtime — it does NOT need the
 * edge runtime, and using edge here would cost us full Node APIs for nothing.
 *
 * A ten-record search is ~30 Discogs calls paced at 1.1s, so roughly 35
 * seconds; the demo list is ~18. 60s leaves headroom and stays within the
 * limit on every plan tier.
 */
export const maxDuration = 60;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "search" ? "search" : "demo";
  const queries = url.searchParams.getAll("q").slice(0, MAX_QUERIES);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
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
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Without this, a proxy buffering the response would defeat the point
      // of streaming and the page would sit blank until the run finished.
      "X-Accel-Buffering": "no",
    },
  });
}
