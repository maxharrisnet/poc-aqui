/**
 * Live FX rates via Frankfurter (ECB data, no API key required).
 * https://frankfurter.dev
 *
 * The real system stores two rates per the spec: a live rate for purchase
 * decisions and the Banxico FIX rate for accounting reconciliation. This PoC
 * only needs the live rate to prove the mechanism.
 */

export interface FxSnapshot {
  date: string;
  /** 1 unit of currency -> N MXN. USD is guaranteed present; others may be missing if Frankfurter omits them. */
  ratesToMxn: { USD: number } & Record<string, number>;
}

const CURRENCIES = ["EUR", "GBP", "JPY", "USD"];

export async function fetchFxSnapshot(): Promise<FxSnapshot> {
  const url = `https://api.frankfurter.dev/v1/latest?base=MXN&symbols=${CURRENCIES.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Frankfurter FX fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { date: string; rates: Record<string, number> };

  // Frankfurter returns MXN -> currency (e.g. 1 MXN = 0.058 USD).
  // We want currency -> MXN, so invert.
  const inverted: Record<string, number> = {};
  for (const [ccy, mxnToCcy] of Object.entries(body.rates)) {
    inverted[ccy] = 1 / mxnToCcy;
  }
  inverted.MXN = 1;

  const usd = inverted.USD;
  if (usd === undefined) {
    throw new Error("Frankfurter response did not include a USD rate: cannot compute landed cost in USD");
  }

  return { date: body.date, ratesToMxn: { ...inverted, USD: usd } };
}
