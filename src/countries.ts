/**
 * Discogs reports a *pressing* country ("Germany", "UK & Europe", "US").
 * We use it as a proxy for shipping origin, which is an approximation and
 * an important one to be honest about:
 *
 *   Customs treatment depends on where the SELLER SHIPS FROM, not where the
 *   record was pressed. A German pressing may well be sold by someone in
 *   Guadalajara. The official Discogs API does not expose seller location
 *   for marketplace listings. That is precisely the gap eBay's Browse API
 *   fills in Phase 1 (see the brief, §4.1).
 *
 * So: treat origin here as indicative. It is right often enough to prove
 * the mechanism, and wrong often enough that it must be labelled.
 */

export interface OriginResolution {
  iso: string;
  approximate: boolean;
  label: string;
}

const EXACT: Record<string, string> = {
  US: "US",
  USA: "US",
  Canada: "CA",
  Mexico: "MX",
  Germany: "DE",
  UK: "GB",
  "United Kingdom": "GB",
  Japan: "JP",
  Netherlands: "NL",
  France: "FR",
  Italy: "IT",
  Spain: "ES",
  Belgium: "BE",
  Sweden: "SE",
  Denmark: "DK",
  Norway: "NO",
  Finland: "FI",
  Austria: "AT",
  Switzerland: "CH",
  Portugal: "PT",
  Ireland: "IE",
  Poland: "PL",
  Greece: "GR",
  Australia: "AU",
  "New Zealand": "NZ",
  Brazil: "BR",
  Argentina: "AR",
  Colombia: "CO",
  Peru: "PE",
  Chile: "CL",
};

/** Multi-country pressings. We pick a representative and flag it. */
const REGIONAL: Record<string, string> = {
  Europe: "DE",
  "UK & Europe": "GB",
  "UK, Europe & US": "GB",
  "USA & Canada": "US",
  "US & Canada": "US",
  Scandinavia: "SE",
  Benelux: "NL",
};

export function resolveOrigin(discogsCountry: string | undefined): OriginResolution {
  if (!discogsCountry) {
    return { iso: "DE", approximate: true, label: "Unknown: assumed EU" };
  }

  const exact = EXACT[discogsCountry];
  if (exact) return { iso: exact, approximate: false, label: discogsCountry };

  const regional = REGIONAL[discogsCountry];
  if (regional) return { iso: regional, approximate: true, label: `${discogsCountry}: assumed ${regional}` };

  return { iso: "DE", approximate: true, label: `${discogsCountry}: assumed EU` };
}
