/**
 * Seed watchlist for the proof of concept. In the real system this is Ian's
 * Discogs want list (synced automatically); here it's a hand-picked spread
 * chosen to stress-test the landed-cost engine across origins.
 *
 * Every discogsId below was verified against GET /releases/{id} on the live
 * Discogs API before being committed here — do not add IDs from memory or
 * guesswork, they are wrong more often than not. Confirm with the API first.
 */

export interface WatchedRelease {
  discogsId: number;
  artist: string;
  title: string;
  year: number;
  originCountry: string; // ISO 3166-1 alpha-2, used for customs/shipping lookup
  note: string; // why this record is in the demo set
}

export const WATCHLIST: WatchedRelease[] = [
  {
    discogsId: 15159,
    artist: "Kraftwerk",
    title: "Autobahn",
    year: 1974,
    originCountry: "DE",
    note: "EU baseline — reliably in stock, moderate price",
  },
  {
    discogsId: 2164,
    artist: "Basic Channel",
    title: "Q 1.1",
    year: 1993,
    originCountry: "DE",
    note: "Genuinely rare Berlin dub techno — tests a higher price point",
  },
  {
    discogsId: 72273,
    artist: "Underground Resistance",
    title: "Riot EP",
    year: 1991,
    originCountry: "US",
    note: "USMCA de minimis path — different customs treatment from EU/Asia",
  },
  {
    discogsId: 1984264,
    artist: "Yellow Magic Orchestra",
    title: "Solid State Survivor",
    year: 1979,
    originCountry: "JP",
    note: "Longest shipping lane — tests the high end of the tasa global",
  },
  {
    discogsId: 2558,
    artist: "Fingers Inc.",
    title: "Mystery Of Love",
    year: 1986,
    originCountry: "US",
    note: "Chicago house original — second US data point at a different price tier",
  },
  {
    discogsId: 11778,
    artist: "Boards Of Canada",
    title: "Music Has The Right To Children",
    year: 1998,
    originCountry: "GB",
    note: "Post-Brexit EU-adjacent data point",
  },
  {
    discogsId: 7841640,
    artist: "Various",
    title: "The Roots Of Chicha: Psychedelic Cumbias From Peru",
    year: 2015,
    originCountry: "US",
    note: "Latin American relevance; compilation identity match on a Various Artists credit",
  },
  {
    discogsId: 3228976,
    artist: "La Revolucion De Emiliano Zapata",
    title: "La Revolucion De Emiliano Zapata",
    year: 1971,
    originCountry: "MX",
    note: "CONTROL CASE — domestic pressing, should show ~zero import cost",
  },
];
