import { getRows, updateRange } from "../src/sheets.js";
import {
  ensureHeaders,
  toRow,
  INVENTORY_HEADERS,
  INVENTORY_RANGE,
  type InventoryItem,
} from "../src/inventory.js";

/**
 * Fills the inventory sheet with a shop's worth of stock, so the Inventory tab
 * has something real-shaped to render:
 *
 *   npm run seed-inventory            # refuses if the sheet already holds rows
 *   npm run seed-inventory -- --force # overwrite whatever is there
 *
 * Written as one block rather than 46 appendRow calls. appendRow re-reads the
 * whole grid before every write to find the next free row, which would be 92
 * API calls and several minutes against a rate limit that is shared with the
 * watchlist sweep.
 *
 * Discogs ids are only present on the eight titles that also appear in
 * src/releases.ts, where each one was verified against the live API. The rest
 * are deliberately blank: an invented release id is worse than a missing one,
 * because it looks authoritative and prices the wrong record.
 */

/** artist, album, releaseId, condition, qty, minQty, shelfMxn, landedMxn, maxLandedMxn, watching, notes */
type Seed = [
  string,
  string,
  number | null,
  string,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  boolean,
  string,
];

/**
 * Stock as it would actually sit on a shelf: a few deep house titles in
 * multiples, a lot of singles, and a handful already at or under their restock
 * floor. Those are the rows the Inventory tab flags, and the reason a record
 * switches its own watch back on.
 */
const SEED: readonly Seed[] = [
  // --- the eight with verified Discogs ids, shared with the demo watchlist ---
  ["Kraftwerk", "Autobahn", 15159, "VG+", 3, 1, 1450, 760, 850, false, "1974 Vertigo DE press, gatefold intact"],
  ["Basic Channel", "Q 1.1", 2164, "VG", 1, 1, 3200, 1980, 2100, true, "Original Berlin 12in: sells the day it lands"],
  ["Underground Resistance", "Riot EP", 72273, "VG+", 0, 1, 1980, 1120, 1200, true, "Out of stock since June, asked for twice a week"],
  ["Yellow Magic Orchestra", "Solid State Survivor", 1984264, "NM", 2, 1, 2400, 1340, 1500, false, "JP Alfa press, obi missing"],
  ["Fingers Inc.", "Mystery Of Love", 2558, "VG", 1, 1, 2650, 1560, 1700, true, "Chicago original, light surface noise on the B"],
  ["Boards Of Canada", "Music Has The Right To Children", 11778, "NM", 2, 1, 1890, 1010, 1150, false, "Warp repress, sleeve sharp"],
  ["Various", "The Roots Of Chicha: Psychedelic Cumbias From Peru", 7841640, "NM", 4, 2, 980, 520, 600, false, "Counter staple, never let this one run out"],
  ["La Revolución De Emiliano Zapata", "La Revolución De Emiliano Zapata", 3228976, "VG", 1, 1, 2200, 1180, 1300, true, "Polydor MX 1971, hard to find clean"],

  // --- Mexico and the Mexican shelf ---
  ["Café Tacvba", "Re", null, "NM", 5, 2, 890, 430, 500, false, "Reissue, moves steadily all year"],
  ["Caifanes", "El Silencio", null, "VG+", 2, 1, 1120, 590, 680, false, "1992 BMG press"],
  ["Los Ángeles Azules", "Cómo Te Voy A Olvidar", null, "VG+", 6, 3, 640, 290, 340, false, "Cumbia section anchor"],
  ["Juan García Esquivel", "Space-Age Bachelor Pad Music", null, "VG", 1, 1, 1340, 720, 800, true, "Bar-owner bait, gone within a week each time"],
  ["Chavela Vargas", "La Llorona", null, "NM", 3, 1, 760, 340, 400, false, "Repress, plays beautifully"],
  ["José José", "Reencuentro", null, "VG", 2, null, 580, 260, null, false, "Bought a small lot of these, no rush to replace"],
  ["Los Ángeles Negros", "Y Volveré", null, "VG+", 2, 1, 820, 380, 450, false, "CL press via a Guadalajara dealer"],
  ["Los Saicos", "Demolición", null, "NM", 1, 1, 1450, 780, 880, true, "Peruvian proto-punk, one copy left"],

  // --- Brazil ---
  ["Milton Nascimento & Lô Borges", "Clube Da Esquina", null, "VG+", 2, 1, 2100, 1150, 1280, false, "Double LP, EMI reissue"],
  ["Arthur Verocai", "Arthur Verocai", null, "NM", 1, 1, 3400, 2050, 2200, true, "Mr Bongo repress. The expensive one people ask for"],
  ["Tom Zé", "Estudando O Samba", null, "VG+", 2, 1, 1280, 660, 750, false, "Light ring wear on the sleeve"],
  ["Gal Costa", "Índia", null, "VG", 1, 1, 1560, 840, 950, true, "Original sleeve, the one that got censored"],
  ["Stan Getz & João Gilberto", "Getz/Gilberto", null, "VG+", 3, 1, 1180, 610, 700, false, "Verve reissue, always sells"],

  // --- jazz ---
  ["Alice Coltrane", "Journey In Satchidananda", null, "NM", 2, 1, 1780, 940, 1050, false, "Impulse! Acoustic Sounds series"],
  ["Pharoah Sanders", "Karma", null, "VG+", 1, 1, 1920, 1040, 1150, true, "US press, seam split repaired"],
  ["Sun Ra", "Lanquidity", null, "NM", 2, 1, 2050, 1120, 1250, false, "Strut reissue, still shrink-wrapped"],
  ["Miles Davis", "In A Silent Way", null, "VG+", 3, 1, 1240, 640, 720, false, "Columbia repress"],
  ["Bill Evans Trio", "Sunday At The Village Vanguard", null, "VG", 1, 1, 1680, 900, 1000, true, "Mono, quiet vinyl for its age"],
  ["Mulatu Astatke", "Mulatu Of Ethiopia", null, "NM", 2, 1, 1620, 860, 960, false, "Strut, sells to the DJ crowd"],

  // --- Africa and the diaspora ---
  ["Fela Kuti", "Zombie", null, "NM", 4, 2, 980, 480, 560, false, "Knitting Factory reissue, house favourite"],
  ["Tony Allen", "Black Voices", null, "VG+", 2, 1, 1340, 700, 790, false, "Comet press"],
  ["William Onyeabor", "Body & Soul", null, "VG+", 1, 1, 1480, 790, 880, true, "Luaka Bop, last one on the shelf"],
  ["Nuyorican Soul", "Nuyorican Soul", null, "VG", 2, 1, 1740, 920, 1020, false, "Double LP, jackets a little tired"],

  // --- techno, house and the back wall ---
  ["Jeff Mills", "Waveform Transmission Vol. 1", null, "VG+", 2, 1, 1860, 990, 1100, false, "Tresor, plays clean"],
  ["Drexciya", "Neptune's Lair", null, "NM", 1, 1, 2480, 1420, 1550, true, "Tresor repress, single copy"],
  ["Larry Heard", "Alien", null, "VG+", 2, 1, 1560, 820, 920, false, "Alleviated repress"],
  ["Moodymann", "Silentintroduction", null, "VG", 1, 1, 2900, 1720, 1850, true, "Planet E original, worth the wait"],
  ["Theo Parrish", "First Floor", null, "VG+", 1, 1, 2650, 1540, 1680, true, "Triple LP, sleeve creased at the spine"],
  ["Aphex Twin", "Selected Ambient Works 85-92", null, "NM", 3, 1, 1420, 740, 830, false, "Apollo repress, steady seller"],
  ["Burial", "Untrue", null, "NM", 2, 1, 1380, 720, 810, false, "Hyperdub, restocked every few months"],

  // --- ambient and kankyō ongaku ---
  ["Brian Eno", "Ambient 1: Music For Airports", null, "NM", 3, 1, 1320, 690, 780, false, "Virgin EMI reissue"],
  ["Harold Budd & Brian Eno", "The Pearl", null, "VG+", 1, 1, 1580, 850, 940, true, "Original EG press"],
  ["Hiroshi Yoshimura", "Music For Nine Post Cards", null, "NM", 2, 1, 1740, 930, 1040, false, "Empire of Signs, reprinted at last"],
  ["Midori Takada", "Through The Looking Glass", null, "NM", 1, 1, 2280, 1300, 1420, true, "WRWTFWW, one copy and a waiting list"],

  // --- post-punk and the wall by the door ---
  ["Cocteau Twins", "Treasure", null, "VG+", 2, 1, 1180, 620, 700, false, "4AD reissue"],
  ["The Cure", "Disintegration", null, "NM", 3, 1, 1260, 660, 740, false, "Double LP, Fiction repress"],
  ["Joy Division", "Unknown Pleasures", null, "NM", 4, 2, 1090, 560, 640, false, "Never off the shelf for long"],
  ["Siouxsie & The Banshees", "Juju", null, "VG", 1, 1, 1150, 610, 690, true, "Polydor UK press, sleeve foxed"],
];

/** Fixed anchor rather than the clock, so re-seeding produces the same sheet.
 *  Spreads intake across the eight months before the demo. */
const ANCHOR = Date.UTC(2026, 7, 12); // 2026-08-12
const DAY = 86_400_000;

function addedAt(index: number): string {
  return new Date(ANCHOR - index * 5 * DAY).toISOString();
}

/**
 * When the shop last bought a copy, which is a different question from when the
 * title first reached the shelf.
 *
 * Measured forward from intake rather than back from today, because a restock
 * cannot predate the row it restocks: anchoring it to today put most of the
 * single-copy titles before their own arrival date and blanked them.
 *
 * Deep stock has been bought recently and often; a title down to its last copy
 * has usually not been re-bought since it landed, which is why it is down to
 * one. Every fifth title returns empty on purpose: never restocked since intake
 * is a real state, and the interface has to have rows that show it.
 */
function lastPurchasedAt(index: number, qty: number, added: string): string {
  if (index % 5 === 4) return "";

  const from = Date.parse(added);
  const span = ANCHOR - from;
  if (span <= 0) return ""; // arrived today; nothing has been re-bought yet

  const through = qty >= 3 ? 0.82 : qty === 2 ? 0.55 : 0.24;
  const jitter = ((index % 7) - 3) * 3 * DAY;
  const when = Math.min(Math.max(from + span * through + jitter, from), ANCHOR);
  return new Date(when).toISOString();
}

const items: InventoryItem[] = SEED.map(
  (
    [artist, album, releaseId, condition, qty, minQty, shelfPriceMxn, landedCostMxn, maxLandedMxn, watching, notes],
    i,
  ) => ({
    id: `i_seed${String(i + 1).padStart(2, "0")}`,
    artist,
    album,
    releaseId,
    condition,
    qty,
    minQty,
    shelfPriceMxn,
    landedCostMxn,
    maxLandedMxn,
    watching,
    addedAt: addedAt(i),
    notes,
    // Left blank on purpose: scripts/enrich-inventory.ts fills sleeve art,
    // year and any missing release id from Discogs, so the seed never
    // hardcodes a URL that can rot.
    thumbUrl: "",
    year: null,
    // Anything already being watched is worth being told about: an armed watch
    // with no alert channel just waits to be noticed by hand.
    alertSms: watching,
    lastPurchasedAt: lastPurchasedAt(i, qty, addedAt(i)),
  }),
);

const force = process.argv.includes("--force");

const sheetId = process.env.INVENTORY_SHEET_ID;
if (!sheetId) {
  console.error("INVENTORY_SHEET_ID is not set. Nothing to seed.");
  process.exit(1);
}

const existing = (await getRows(sheetId, INVENTORY_RANGE))
  .slice(1)
  .filter((r) => (r[0] ?? "").trim() !== "");

if (existing.length > 0 && !force) {
  console.error(
    `The inventory sheet already holds ${existing.length} row(s). Seeding would overwrite them.\n` +
      `Re-run with --force if that is what you want:\n\n  npm run seed-inventory -- --force\n`,
  );
  process.exit(1);
}

await ensureHeaders();

const lastColumn = INVENTORY_RANGE.split(":")[1];
const lastRow = items.length + 1; // +1 for the header row
await updateRange(sheetId, `A2:${lastColumn}${lastRow}`, items.map(toRow));

// Anything the previous contents left below the new block would otherwise
// survive as orphan stock the app still reads.
const stale = existing.length - items.length;
if (stale > 0) {
  await updateRange(
    sheetId,
    `A${lastRow + 1}:${lastColumn}${lastRow + stale}`,
    Array.from({ length: stale }, () => INVENTORY_HEADERS.map(() => "")),
  );
  console.log(`Cleared ${stale} stale row(s) below the seeded block.`);
}

const low = items.filter((i) => i.minQty !== null && i.qty <= i.minQty).length;
console.log(
  `Seeded ${items.length} inventory items (rows 2–${lastRow}). ` +
    `${low} are at or under their restock floor, ${items.filter((i) => i.watching).length} are being watched.`,
);
