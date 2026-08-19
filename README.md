# Aqui Ahora — sourcing engine proof of concept

Proves the core mechanism from the technical spec end to end, with real data:
Discogs marketplace stats → real FX rates → the versioned Mexico customs
logic → a formatted digest, for 8 hand-picked records spanning five origin
countries.

**What this proves:** the Discogs integration works within the sanctioned
API (no scraping), the landed-cost math is real rather than a mockup, and
the output is something Ian would actually read.

**What this deliberately skips:** dashboard, triage state, eBay adapter,
Bandcamp ingestion, n8n scheduling, Google Docs API — none of that needs to
exist to make the point. This writes Markdown to a file instead of a live
Google Doc; the API call itself is small, mechanical Phase 1 work.

## Running it

Two ways in. Generate a token first at discogs.com/settings/developers —
about two minutes, no app registration, just a personal access token.

**Web interface** (use this for the demo):

```bash
cd poc
npm install
DISCOGS_TOKEN=your_token npm run serve
```

Then open http://localhost:4173 and press **Check prices now**. The check
runs on button press rather than page load, so the live data arriving is
something you can show happening in the room. Results are cached in memory,
so reloading the page doesn't burn Discogs rate limit.

**CLI** (writes a Markdown digest):

```bash
DISCOGS_TOKEN=your_token npm run digest
```

Output goes to `output/digest.md`.

To verify the logic without hitting the Discogs API at all (useful for
re-checking after any change to the cost math):

```bash
npm run smoketest
```

> There is deliberately no `start` script. Vercel's backend detector treats one
> as a signal that the project is a Node server and tries to deploy it as such,
> which breaks the static-plus-functions build.

## Watchlist (v0.2a)

State now lives in Google Sheets rather than memory. Two sheets, deliberately
separate because they hold different things: **Watchlist** is one row per album
you want; **Inventory** (v0.2b) will be one row per physical copy you own.

### Setup

Beyond `DISCOGS_TOKEN`, four environment variables are required:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
WATCHLIST_SHEET_ID=...
INVENTORY_SHEET_ID=...
```

Locally these go in `.env.local` (gitignored); on Vercel, in the project's
environment variables.

**Run this first, before anything else:**

```bash
npm run check-sheets
```

It reads one cell from each sheet and reports precisely what is wrong. The
overwhelmingly common failure is a 403, which is almost never a bad key — it
means the spreadsheets have not been shared with the service account's email
address as an Editor. Two other things that bite: `GOOGLE_PRIVATE_KEY` must keep
its literal `\n` sequences and stay quoted, and the Sheets API must be enabled
on the Cloud project.

### Using it

- **Watch** on any result adds the record. A POST takes 2–3 seconds because it
  makes two or three rate-limited Discogs calls; the button disables itself
  meanwhile, so a double-click cannot create duplicate rows.
- **Alert under** sets a per-record threshold in pesos, saved on blur.
- **Check my watchlist** sweeps every watched pressing and writes results back
  to the sheet as it goes.

The sweep only covers rows where `active` is `TRUE`. That column is the lever
for keeping a growing watchlist inside the time budget — paused rows cost
nothing.

### Watching albums, not pressings

Adding a record watches *every vinyl pressing of that album* when the master has
ten or fewer, and asks you to pick when it has more. Basic Channel's *Q 1.1* has
6, so all are watched; Kraftwerk's *Autobahn* has 143, so you choose. The
threshold is `PRESSING_AUTO_WATCH_LIMIT`, defaulting to 10.

This is why a sweep can return a cheaper pressing than the one you added.

**`/masters/{id}` exposes a `lowest_price` — never use it for pricing.** It
ignores `curr_abbr` (identical figure for USD and EUR) and spans every format,
so its "cheapest copy" may be a CD. All pricing goes through
`/marketplace/stats/{release_id}?curr_abbr=USD`. Master data enumerates versions
and nothing else.

### Two Sheets behaviours that cost real time

Both were found the hard way and are worth knowing before touching `src/sheets.ts`:

- **`values.append` silently corrupts writes.** With an open-ended range and a
  blank row anywhere in the data, its table detection misfires: a 17-column row
  landed as 2 values in columns P and Q, fifteen fields discarded, HTTP 200.
  `appendRow` therefore computes the target row and writes to it explicitly, and
  `addWatchItem` reads the row back to confirm what landed.
- **Never derive a sheet row from an array index.** `listWatchItems` filters out
  blank rows, so position in that array and true row number drift apart the
  moment a blank row exists above the target — updates then overwrite an
  unrelated record. Use `resolveRowNumber`, which scans the raw grid.

The common thread: Sheets' convenience features guess, and guesses corrupt data.
Address rows explicitly.

### The dev server holds no logic

`src/server.ts` delegates every `/api/*` route to the same handler Vercel runs.
An earlier version reimplemented the SSE stream inline and drifted — `mode=watchlist`
was added to `api/stream.ts` but not to the server's private copy, so local
sweeps silently ran the demo list instead. Add a route to `ROUTES`, never logic.

## Deploying to Vercel

The project is deploy-ready: `public/` is served statically, `api/stream.ts`
and `api/results.ts` become functions. Streaming runs on the **default Node.js
runtime** — SSE does not need the edge runtime, and edge would cost us full
Node APIs for nothing.

### The Framework Preset must be "Other", not "Node"

This cost an afternoon, so it's worth writing down. If the Vercel project's
**Framework Preset** is set to `Node`, Vercel uses its *backends* builder,
which expects a long-running server entrypoint. This project isn't one — it's
static files plus functions — so every deploy either grabbed `src/index.ts` as
a phantom entrypoint or failed with "No entrypoint found", and the `/api/*`
routes 404'd while the page itself served fine.

`vercel.json` now pins `"framework": null`, which overrides the dashboard, so
the fix travels with the repo rather than living in someone's browser. Set the
dashboard preset to **Other** as well, to clear the "Configuration Settings
differ" warning.

Supporting details:

- `.vercelignore` excludes `src/index.ts`, `src/server.ts` and `src/smoketest.ts`.
  Each has a top-level `main()` or calls `server.listen()`, which feeds the same
  misdetection. Nothing in `api/` imports them. There is deliberately no `start`
  script for the same reason.
- The functions use the classic Node `(req, res)` handler signature. It works
  under both zero-config and legacy `builds`, unlike the Web-standard
  `(Request) => Response` form.
- `vercel.json` is strict JSON — no comments, and unknown keys (even a `"//"`
  convention key) fail schema validation.

```bash
cd poc
npx vercel login
npx vercel link
npx vercel env add DISCOGS_TOKEN production
npx vercel --prod
```

`vercel env add` will prompt for the token value — paste the same one used
locally. Without it the site loads fine but every check returns a clear
"DISCOGS_TOKEN is not configured on the server" message.

### Three things to know before sharing the URL

**The link now writes to the sheets, not just reads.** v0.1 was read-only, so an
open URL cost only rate limit. From v0.2a, anyone holding the link can add to
and edit the watchlist. **Keep Vercel's deployment protection enabled**, or put
a shared passphrase in front of the mutating endpoints. Do not ship open write
access on a link that gets forwarded.

**The link spends your Discogs quota.** Anyone who has it can run checks
against your token. For a demo shared with two or three people that's fine.
If it's going anywhere wider, turn on Vercel's deployment protection — check
which options your plan offers.

**Concurrent runs can hit the rate limit.** The 1.1s pacing is enforced per
function instance, and serverless spins up an instance per concurrent request,
so two people running ten-record searches at the same moment can exceed
Discogs' 60/min ceiling. The failure is graceful — "Discogs rate limit hit —
wait a minute and try again" — but worth knowing before a live demo. Two
people on the demo list is comfortably fine; it's simultaneous large searches
that bite.

**Nothing is cached between visits.** The local dev server keeps the last run
in memory; serverless has no shared memory, so `/api/results` returns null and
each visitor runs their own check. That's the right model for a shared link,
and it means the page always opens on the idle state.

## How the watchlist was chosen

Every `discogsId` in `src/releases.ts` was verified against the live
`GET /releases/{id}` endpoint before being committed — release IDs guessed
from memory were wrong in every single case on the first pass. Don't add an
ID without checking it first.

The eight records were picked to stress-test the landed-cost engine, not
because they're necessarily what Ian would watch:

- **Germany, UK** — reliable baseline, moderate prices
- **USA** — tests the USMCA de minimis path, which is genuinely different
  customs treatment from everywhere else
- **Japan** — longest shipping lane, highest tasa global exposure
- **Mexico** (La Revolución de Emiliano Zapata, 1971) — the control case.
  A domestic pressing should show ~zero import cost. If it doesn't, the
  customs logic is broken, not just imprecise.

## What's real vs. illustrative

| Component | Status |
|---|---|
| Discogs marketplace stats | **Real** — live API, sanctioned endpoints only |
| FX rates | **Real** — live ECB reference rates via Frankfurter, no key needed |
| Customs rules (duty, IVA, tasa global, formal-entry threshold) | Real structure, **not broker-validated** — see `src/customsRules.ts` |
| Shipping estimates | **Illustrative** — not a live carrier quote. Flagged as low-confidence in every output, exactly as the real system would flag an estimate with no purchase history behind it yet |

## The interface

Two tabs. **Buying desk** is the tool; **How it works** explains the whole
chain in eight steps so the client can understand it without us narrating.

On the desk you can either type up to ten records into the search rows, or
press **Use the demo list** for the eight curated pressings. Results stream
in one at a time over Server-Sent Events rather than appearing after a long
spinner — the check takes 15–35 seconds depending on how many records, and
watching it work is better than watching it hang.

Every record shows a stacked bar decomposing landed cost into record /
shipping / duty / IVA. Expanding a row gives cover art, label and catalogue
number, format, pressing country, styles, the actual money in every cost
line, and direct links to buy on Discogs. A header toggle flips the whole
page between MXN and USD.

Two things worth pointing at during a demo:

- **Kraftwerk — Autobahn.** A ~$10 record where shipping and import cost
  visibly dominate the bar. Cheap records are the ones the current manual
  process misprices worst.
- **La Revolución de Emiliano Zapata.** Renders as a single unbroken green
  bar — no shipping, no duty, no IVA. The control case proving the customs
  logic is conditional on origin, not a flat markup on everything.

### One caveat that matters more than it looks

Origin is taken from the **pressing country**, because the official Discogs
API doesn't expose where a seller actually ships from. Customs treatment
depends on the latter. A German pressing may well be sold from Guadalajara.
It's right often enough to prove the mechanism and wrong often enough to be
labelled — which is exactly the gap eBay's Browse API closes in Phase 1.

## Files

- `releases.ts` — the watchlist, with verified Discogs IDs
- `discogs.ts` — API client, sanctioned endpoints only
- `fx.ts` — live FX via Frankfurter
- `shipping.ts` — origin-based shipping estimates
- `customsRules.ts` — versioned Mexico customs rules, kept separate from the
  calculation logic on purpose so a broker can correct the numbers without
  touching code
- `landedCost.ts` — combines the above into one figure per release
- `digest.ts` — renders the Markdown digest
- `countries.ts` — Discogs pressing country to ISO code, with the seller-location caveat documented
- `smoketest.ts` — exercises the full pipeline with mocked Discogs data
- `run.ts` — shared check logic; `runDemo()` for the curated list, `runSearch()` for typed queries
- `server.ts` — zero-dependency HTTP server, streams results over SSE
- `public/index.html` — the interface
- `index.ts` — orchestrates a real CLI run
# poc-aqui
