import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 4173);

/**
 * Local dev server. Serves the static page and delegates every /api/* route to
 * the same handler Vercel runs in production.
 *
 * It deliberately holds NO logic of its own. An earlier version reimplemented
 * the SSE stream inline, which silently drifted: `mode=watchlist` was added to
 * api/stream.ts but not here, so local sweeps quietly ran the demo list
 * instead. Delegating is the only way local and deployed stay honest.
 */

type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

const ROUTES: Record<string, () => Promise<{ default: ApiHandler }>> = {
  "/api/stream": () => import("../api/stream.js"),
  "/api/results": () => import("../api/results.js"),
  "/api/inventory": () => import("../api/inventory.js"),
  "/api/sourcing": () => import("../api/sourcing.js"),
};

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

  const load = ROUTES[url.pathname];
  if (load) {
    try {
      const { default: handler } = await load();
      await handler(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  // Anything else: try public/ as a static asset, the way Vercel serves it in
  // production. Resolved path is checked to stay inside public/ so a crafted
  // ../ URL can't read outside it.
  const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
  const resolved = path.resolve(publicDir, "." + path.posix.normalize(url.pathname));
  if (resolved.startsWith(publicDir)) {
    try {
      const body = await readFile(resolved);
      const mime: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".webmanifest": "application/manifest+json",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
      };
      res.writeHead(200, {
        "Content-Type": mime[path.extname(resolved).toLowerCase()] ?? "application/octet-stream",
      });
      res.end(body);
      return;
    } catch {
      // fall through to 404
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. An older copy of this server is probably still running.\n` +
        `  Stop it with:  lsof -ti :${PORT} | xargs kill\n` +
        `  Or use another port:  PORT=4174 npm run serve`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Aqui Ahora buying desk: http://localhost:${PORT}`);
  if (!process.env.DISCOGS_TOKEN) {
    console.warn("WARNING: DISCOGS_TOKEN not set. Checks will fail until it is set.");
  }
});
