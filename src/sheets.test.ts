import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { base64url, buildJwt, normalisePrivateKey } from "./sheets.js";

test("base64url encodes without padding or url-unsafe characters", () => {
  const encoded = base64url('{"alg":"RS256","typ":"JWT"}');
  assert.equal(encoded.includes("="), false);
  assert.equal(encoded.includes("+"), false);
  assert.equal(encoded.includes("/"), false);
  assert.equal(Buffer.from(encoded, "base64url").toString(), '{"alg":"RS256","typ":"JWT"}');
});

test("normalisePrivateKey restores escaped newlines", () => {
  assert.equal(normalisePrivateKey("a\\nb"), "a\nb");
  assert.equal(normalisePrivateKey("a\nb"), "a\nb");
});

test("buildJwt produces three signed segments with the right claims", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const jwt = buildJwt("svc@proj.iam.gserviceaccount.com", privateKey, 1_700_000_000);
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);

  const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
  assert.equal(claims.iss, "svc@proj.iam.gserviceaccount.com");
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
  assert.equal(claims.scope, "https://www.googleapis.com/auth/spreadsheets");
  assert.equal(claims.exp - claims.iat, 3600);
});
