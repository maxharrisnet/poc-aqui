import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { base64url, buildJwt, normalisePrivateKey, nextFreeRow, rowRange, qualifyRange } from "./sheets.js";

test("base64url replaces url-unsafe characters and strips padding", () => {
  // 0xfb 0xff 0xbf is base64 "+/+/" — exercises both substitutions.
  assert.equal(base64url(Buffer.from([0xfb, 0xff, 0xbf])), "-_-_");
  // A one-byte input base64s to "+w==" — exercises padding removal too.
  assert.equal(base64url(Buffer.from([0xfb])), "-w");
  assert.equal(
    Buffer.from(base64url('{"alg":"RS256","typ":"JWT"}'), "base64url").toString(),
    '{"alg":"RS256","typ":"JWT"}',
  );
});

test("normalisePrivateKey restores escaped newlines", () => {
  assert.equal(normalisePrivateKey("a\\nb"), "a\nb");
  assert.equal(normalisePrivateKey("a\nb"), "a\nb");
});

test("normalisePrivateKey survives the ways a deploy mangles a PEM", () => {
  // Quoting is required in a .env file and fatal in Vercel's dashboard. The
  // resulting DECODER error names nothing useful, so this is worth a test.
  assert.equal(normalisePrivateKey('"a\\nb"'), "a\nb");
  assert.equal(normalisePrivateKey("'a\\nb'"), "a\nb");
  // Two passes of JSON encoding double the escape.
  assert.equal(normalisePrivateKey("a\\\\nb"), "a\nb");
  // Windows clipboards add carriage returns.
  assert.equal(normalisePrivateKey("a\r\nb"), "a\nb");
  assert.equal(normalisePrivateKey("  a\\nb  "), "a\nb");
  // A quote inside the body is not a wrapper and must survive.
  assert.equal(normalisePrivateKey('a"b'), 'a"b');
});

test("a real PEM round-trips through every mangling and still signs", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const escaped = privateKey.replace(/\n/g, "\\n");
  for (const variant of [privateKey, escaped, `"${escaped}"`, `  ${escaped}  `]) {
    assert.doesNotThrow(
      () => buildJwt("svc@proj.iam.gserviceaccount.com", variant, 1_700_000_000),
      `failed for variant starting ${JSON.stringify(variant.slice(0, 12))}`,
    );
  }
});

test("buildJwt produces three signed segments with the right claims", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const jwt = buildJwt("svc@proj.iam.gserviceaccount.com", privateKey, 1_700_000_000);
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);

  const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
  assert.equal(header.alg, "RS256");
  assert.equal(header.typ, "JWT");

  const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
  assert.equal(claims.iss, "svc@proj.iam.gserviceaccount.com");
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
  assert.equal(claims.scope, "https://www.googleapis.com/auth/spreadsheets");
  assert.equal(claims.exp - claims.iat, 3600);

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  assert.equal(verifier.verify(publicKey, Buffer.from(parts[2]!, "base64url")), true);
});

test("nextFreeRow returns the row below all data, ignoring interior blanks", () => {
  assert.equal(nextFreeRow([]), 1);
  assert.equal(nextFreeRow([["header"]]), 2);
  // Header, two rows, a blank, another row — next free is 6, not 5.
  assert.equal(nextFreeRow([["h"], ["a"], ["b"], [], ["d"]]), 6);
});

test("rowRange builds an A1 range for a single row", () => {
  assert.equal(rowRange("A:Q", 8), "A8:Q8");
  assert.equal(rowRange("A:C", 1), "A1:C1");
});

test("rowRange rejects anything that is not a plain column range", () => {
  assert.throws(() => rowRange("A1:Q9", 2), /Expected a column range/);
  assert.throws(() => rowRange("A", 2), /Expected a column range/);
  assert.throws(() => rowRange("", 2), /Expected a column range/);
});

test("qualifyRange quotes a plain tab name", () => {
  assert.equal(qualifyRange("Sheet1", "A:Q"), "'Sheet1'!A:Q");
});

test("qualifyRange quotes a tab name containing spaces", () => {
  assert.equal(qualifyRange("Hoja 1", "A1:Q1"), "'Hoja 1'!A1:Q1");
});

test("qualifyRange escapes an apostrophe in the tab name", () => {
  assert.equal(qualifyRange("Ian's Watchlist", "A8:Q8"), "'Ian''s Watchlist'!A8:Q8");
});
