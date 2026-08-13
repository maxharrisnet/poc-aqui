import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { runDemo, runSearch, MAX_QUERIES, type RunSummary } from "./run.js";

const PORT = Number(process.env.PORT ?? 4173);

/** Last completed run, so a page reload doesn't re-spend Discogs rate limit. */
let cached: RunSummary | null = null;
let streaming = false;

function sse(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/") {
    try {
      const html = await readFile(new URL("../public/index.html", import.meta.url), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Could not read index.html: ${(err as Error).message}`);
    }
    return;
  }

  if (url.pathname === "/api/results") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(cached));
    return;
  }

  if (url.pathname === "/api/stream") {
    if (streaming) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "A check is already running" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    streaming = true;
    const mode = url.searchParams.get("mode") === "search" ? "search" : "demo";
    const queries = url.searchParams.getAll("q").slice(0, MAX_QUERIES);

    try {
      if (mode === "search" && queries.length === 0) {
        throw new Error("No search terms provided");
      }

      const onProgress = (e: { index: number; total: number; label: string }) => sse(res, "progress", e);
      const onResult = (r: unknown) => sse(res, "result", r);

      const summary =
        mode === "search" ? await runSearch(queries, onProgress, onResult) : await runDemo(onProgress, onResult);

      cached = summary;
      sse(res, "done", summary);
    } catch (err) {
      sse(res, "failed", { error: (err as Error).message });
    } finally {
      streaming = false;
      res.end();
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use — an older copy of this server is probably still running.\n` +
        `  Stop it with:  lsof -ti :${PORT} | xargs kill\n` +
        `  Or use another port:  PORT=4174 npm run serve`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Aqui Ahora buying desk — http://localhost:${PORT}`);
  if (!process.env.DISCOGS_TOKEN) {
    console.warn("WARNING: DISCOGS_TOKEN not set — checks will fail until it is.");
  }
});
