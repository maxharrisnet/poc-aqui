import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { base64url, buildJwt, normalisePrivateKey } from "./sheets.js";

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
