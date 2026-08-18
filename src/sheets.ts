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
  return `${unsigned}.${base64url(signer.sign(normalisePrivateKey(privateKey)))}`;
}

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

let cachedToken: { value: string; expiresAt: number } | null = null;

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

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

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
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: now + body.expires_in };
  return body.access_token;
}

async function sheetsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 403) {
    throw new Error(
      "Google returned 403. The service account almost certainly has not been " +
        "granted access — share the spreadsheet with " +
        `${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} as an Editor.`,
    );
  }
  if (!res.ok) {
    throw new Error(`Sheets API ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/** Returns raw cell values. Trailing empty cells are omitted by the API. */
export async function getRows(spreadsheetId: string, range: string): Promise<string[][]> {
  const data = await sheetsFetch<{ values?: string[][] }>(
    `/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
  return data.values ?? [];
}

export async function appendRow(
  spreadsheetId: string,
  range: string,
  row: (string | number)[],
): Promise<void> {
  await sheetsFetch(
    `/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );
}

export async function updateRange(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
): Promise<void> {
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}
