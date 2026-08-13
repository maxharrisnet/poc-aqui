/**
 * The local dev server keeps the last run in memory so a page reload doesn't
 * re-spend Discogs rate limit. Serverless has no shared memory between
 * invocations, so there is genuinely nothing to hand back here — each visitor
 * runs their own check.
 *
 * Returning null rather than a 404 keeps the client code identical in both
 * environments: it already treats null as "nothing cached, show the idle state".
 */
export default function handler(): Response {
  return new Response("null", {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
