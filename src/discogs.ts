/**
 * Minimal Discogs API client — sanctioned endpoints only, per the spec's
 * decision to stay inside Discogs' Terms of Use (§4.1 of the brief).
 *
 *   - GET /database/search                       — resolve a text query to a release
 *   - GET /releases/{id}                         — metadata, cover art
 *   - GET /marketplace/stats/{id}?curr_abbr=USD  — lowest_price, num_for_sale
 *
 * No marketplace listing search — that endpoint does not exist in the
 * official API and is not attempted here.
 *
 * NOTE: /releases/{id} also carries a `lowest_price`, but it ignores the
 * curr_abbr parameter (verified — USD and EUR return an identical figure),
 * so it can't be trusted for a currency-correct number. The explicit
 * /marketplace/stats call is the authoritative source; hence two requests
 * per record rather than one.
 */

const BASE_URL = "https://api.discogs.com";
const USER_AGENT = "AquiAhoraPoC/0.1 +https://thetomorrowshop.com";

/** Discogs allows 60/min authenticated. Serialize all calls at ~55/min. */
const MIN_INTERVAL_MS = 1100;
let nextSlotAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  nextSlotAt = slot + MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) await sleep(wait);
}

function requireToken(): string {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    // Phrased for both environments — this surfaces in the browser, and on a
    // deployed site "npm run serve" would be misleading advice.
    throw new Error(
      "DISCOGS_TOKEN is not configured on the server. Generate a personal access " +
        "token at discogs.com/settings/developers, then set it locally " +
        "(DISCOGS_TOKEN=… npm run serve) or in the deployment's environment variables.",
    );
  }
  return token;
}

async function discogsFetch<T>(path: string): Promise<T> {
  const token = requireToken();
  await throttle();

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT, Authorization: `Discogs token=${token}` },
  });

  if (res.status === 429) {
    throw new Error("Discogs rate limit hit — wait a minute and try again");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discogs ${path} -> ${res.status} ${res.statusText}: ${body.slice(0, 160)}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------- search

interface SearchResponse {
  results: {
    id: number;
    title: string;
    year?: string;
    country?: string;
    thumb?: string;
    cover_image?: string;
    format?: string[];
  }[];
}

export interface SearchHit {
  id: number;
  title: string;
  coverImage: string | null;
}

/** Resolves free text ("Kraftwerk Autobahn") to the best vinyl release match. */
export async function searchRelease(query: string): Promise<SearchHit | null> {
  const params = new URLSearchParams({
    q: query,
    type: "release",
    format: "Vinyl",
    per_page: "1",
  });
  const data = await discogsFetch<SearchResponse>(`/database/search?${params}`);
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    id: hit.id,
    title: hit.title,
    coverImage: hit.cover_image ?? hit.thumb ?? null,
  };
}

// ---------------------------------------------------------------- release

interface RawRelease {
  id: number;
  title: string;
  year?: number;
  country?: string;
  uri?: string;
  thumb?: string;
  images?: { uri?: string; uri150?: string }[];
  artists?: { name: string }[];
  labels?: { name: string; catno: string }[];
  formats?: { name: string; descriptions?: string[] }[];
  genres?: string[];
  styles?: string[];
}

export interface ReleaseMeta {
  id: number;
  artist: string;
  title: string;
  year: number | null;
  country: string | null;
  coverImage: string | null;
  labels: { name: string; catno: string }[];
  format: string;
  genres: string[];
  styles: string[];
  releaseUrl: string;
  buyUrl: string;
}

export async function getRelease(discogsId: number): Promise<ReleaseMeta> {
  const raw = await discogsFetch<RawRelease>(`/releases/${discogsId}`);

  const format = raw.formats?.length
    ? [raw.formats[0]!.name, ...(raw.formats[0]!.descriptions ?? [])].join(" · ")
    : "Unknown format";

  return {
    id: raw.id,
    artist: raw.artists?.map((a) => a.name).join(", ") ?? "Unknown artist",
    title: raw.title,
    year: raw.year ?? null,
    country: raw.country ?? null,
    coverImage: raw.images?.[0]?.uri150 ?? raw.images?.[0]?.uri ?? raw.thumb ?? null,
    labels: raw.labels?.map((l) => ({ name: l.name, catno: l.catno })) ?? [],
    format,
    genres: raw.genres ?? [],
    styles: raw.styles ?? [],
    releaseUrl: raw.uri ?? `https://www.discogs.com/release/${raw.id}`,
    buyUrl: `https://www.discogs.com/sell/release/${raw.id}`,
  };
}

// ------------------------------------------------------------ marketplace

export interface MarketplaceStats {
  lowest_price: { value: number; currency: string } | null;
  num_for_sale: number;
  blocked_from_sale: boolean;
}

export async function getMarketplaceStats(discogsId: number): Promise<MarketplaceStats> {
  return discogsFetch<MarketplaceStats>(`/marketplace/stats/${discogsId}?curr_abbr=USD`);
}

// ----------------------------------------------------------------- master

export interface MasterVersion {
  id: number;
  country: string | null;
  released: string | null;
  format: string | null;
  label: string | null;
  catno: string | null;
}

interface RawVersionsResponse {
  pagination?: { items?: number; pages?: number };
  versions?: {
    id: number;
    country?: string;
    released?: string;
    format?: string;
    label?: string;
    catno?: string;
    major_formats?: string[];
  }[];
}

/**
 * Vinyl versions of a master. Note that /masters/{id} also exposes
 * lowest_price, but it ignores curr_abbr and spans every format including CD,
 * so it must not be used for pricing — see spec v0.2 §4.1.
 *
 * Capped at one page (100) deliberately: a master with more pressings than
 * that is always user-selected, never auto-watched.
 */
export async function getMasterVersions(masterId: number): Promise<{
  total: number;
  versions: MasterVersion[];
}> {
  const data = await discogsFetch<RawVersionsResponse>(
    `/masters/${masterId}/versions?format=Vinyl&per_page=100`,
  );
  return {
    total: data.pagination?.items ?? 0,
    versions: (data.versions ?? []).map((v) => ({
      id: v.id,
      country: v.country ?? null,
      released: v.released ?? null,
      format: v.format ?? null,
      label: v.label ?? null,
      catno: v.catno ?? null,
    })),
  };
}
