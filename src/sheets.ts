import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Vercel stores multi-line env vars with escaped newlines. Signing fails with
 * an opaque error unless they are restored first — see spec v0.2 §7.
 */
export function normalisePrivateKey(key: string): string {
  return key.replace(/\\n/g, "\n");
}

export function buildJwt(email: string, privateKey: string, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);

  let signature: Buffer;
  try {
    signature = signer.sign(normalisePrivateKey(privateKey));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      "GOOGLE_PRIVATE_KEY could not be used for signing — check it is the full PEM including " +
        `BEGIN/END lines, with \\n sequences intact. Underlying error: ${message}`,
    );
  }

  return `${unsigned}.${base64url(signature)}`;
}

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const FETCH_TIMEOUT_MS = 10_000;

let cachedToken: { promise: Promise<{ value: string; expiresAt: number }>; expiresAt: number } | null =
  null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Add it to .env.local locally, and to the project's ` +
        `environment variables in Vercel for the deployed site.`,
    );
  }
  return v;
}

async function requestAccessToken(now: number): Promise<{ value: string; expiresAt: number }> {
  const jwt = buildJwt(
    requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    requireEnv("GOOGLE_PRIVATE_KEY"),
    now,
  );

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new Error(
      "Google token response was malformed — expected access_token and expires_in, got keys: " +
        Object.keys(body).join(", "),
    );
  }

  return { value: body.access_token, expiresAt: now + body.expires_in };
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return (await cachedToken.promise).value;
  }

  const promise = requestAccessToken(now).catch((err: unknown) => {
    cachedToken = null; // never cache a failure
    throw err;
  });
  // Optimistic expiry; corrected below once the real value arrives, so a
  // second concurrent caller joins this same in-flight exchange instead of
  // starting its own.
  cachedToken = { promise, expiresAt: now + 3600 };
  const resolved = await promise;
  cachedToken = { promise, expiresAt: resolved.expiresAt };
  return resolved.value;
}

async function sheetsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  const res = await fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (res.status === 401) {
    cachedToken = null;
    throw new Error(
      `Sheets API ${path} -> 401: the access token was rejected. The cache has been cleared — retrying will fetch a fresh token.`,
    );
  }
  if (res.status === 403) {
    const body = await res.text();
    const isSharingProblem =
      body.includes("PERMISSION_DENIED") || body.includes("caller does not have permission");
    const hint = isSharingProblem
      ? ` The service account most likely has not been granted access — share the spreadsheet with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} as an Editor.`
      : "";
    throw new Error(`Sheets API ${path} -> 403: ${body.slice(0, 200)}${hint}`);
  }
  if (!res.ok) {
    throw new Error(`Sheets API ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

const tabNameCache = new Map<string, string>();

/** The first tab's actual title. Cached per instance. Never assume "Sheet1" —
 *  a Spanish-locale spreadsheet calls it "Hoja 1". */
export async function firstTabName(spreadsheetId: string): Promise<string> {
  const cached = tabNameCache.get(spreadsheetId);
  if (cached !== undefined) return cached;

  const data = await sheetsFetch<{ sheets?: { properties?: { title?: string } }[] }>(
    `/${spreadsheetId}?fields=sheets.properties.title`,
  );
  const title = data.sheets?.[0]?.properties?.title;
  if (!title) throw new Error(`Could not read the tab name for spreadsheet ${spreadsheetId}`);
  tabNameCache.set(spreadsheetId, title);
  return title;
}

/** Sheets needs quotes around a tab name containing spaces. */
export function qualifyRange(tabName: string, range: string): string {
  return `'${tabName.replace(/'/g, "''")}'!${range}`;
}

/**
 * Qualifies a bare column/cell range with the spreadsheet's real first-tab
 * name, so a tab reorder in the UI can never silently redirect a read or
 * write to the wrong sheet. Ranges that already carry a tab (contain "!")
 * are left alone.
 */
async function qualifyIfNeeded(spreadsheetId: string, range: string): Promise<string> {
  if (range.includes("!")) return range;
  const tabName = await firstTabName(spreadsheetId);
  return qualifyRange(tabName, range);
}

/** Returns raw cell values. Trailing empty cells are omitted by the API. */
export async function getRows(spreadsheetId: string, range: string): Promise<string[][]> {
  const qualified = await qualifyIfNeeded(spreadsheetId, range);
  const data = await sheetsFetch<{ values?: string[][] }>(
    `/${spreadsheetId}/values/${encodeURIComponent(qualified)}`,
  );
  return data.values ?? [];
}

/**
 * The first row below all existing data. getRows omits trailing empty rows,
 * so grid.length + 1 is always free — blank rows *within* the data are left
 * alone rather than reused, which keeps this deterministic.
 */
export function nextFreeRow(grid: string[][]): number {
  return grid.length + 1;
}

/** Turns a column range and a row number into an A1 range: ("A:Q", 8) -> "A8:Q8". */
export function rowRange(columnRange: string, rowNumber: number): string {
  const parts = columnRange.split(":");
  const start = parts[0];
  const end = parts[1];
  if (parts.length !== 2 || !start || !end || !/^[A-Z]+$/.test(start) || !/^[A-Z]+$/.test(end)) {
    throw new Error(`Expected a column range like "A:Q", got "${columnRange}"`);
  }
  return `${start}${rowNumber}:${end}${rowNumber}`;
}

/**
 * Appends a row by computing the next free row and writing to it explicitly.
 *
 * Deliberately does NOT use Sheets' values.append. With an open-ended range and
 * a blank row anywhere in the table, append's table detection silently writes
 * only part of the row and shifts it into the wrong columns — verified
 * reproducibly: a 17-column row landed as 2 values in columns P and Q, and the
 * API still returned 200. Explicit addressing is the only reliable option.
 *
 * That same explicit addressing creates its own race: two concurrent callers
 * can both read the same "next free row" and both write there, and the second
 * write wins, silently discarding the first record. Read back what actually
 * landed and retry on a different row (twice, to survive a third writer
 * arriving during the retry) rather than trust the read.
 */
export async function appendRow(
  spreadsheetId: string,
  columnRange: string,
  row: (string | number)[],
  attempt = 0,
): Promise<number> {
  const grid = await getRows(spreadsheetId, columnRange);
  const target = nextFreeRow(grid);
  await updateRange(spreadsheetId, rowRange(columnRange, target), [row]);

  // Another writer may have claimed this row between our read and write.
  const check = await getRows(spreadsheetId, rowRange(columnRange, target));
  const landed = check[0]?.[0] ?? "";
  const expected = String(row[0] ?? "");
  if (landed !== expected && attempt < 2) {
    return appendRow(spreadsheetId, columnRange, row, attempt + 1);
  }
  return target;
}

export async function updateRange(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
): Promise<void> {
  const qualified = await qualifyIfNeeded(spreadsheetId, range);
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(qualified)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}
