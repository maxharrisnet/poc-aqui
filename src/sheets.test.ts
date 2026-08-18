import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { base64url, buildJwt, normalisePrivateKey, nextFreeRow, rowRange } from "./sheets.js";

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
