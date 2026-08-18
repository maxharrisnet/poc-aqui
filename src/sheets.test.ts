import { test } from "node:test";
import assert from "node:assert/strict";
import { base64url } from "./sheets.js";

test("base64url encodes without padding or url-unsafe characters", () => {
  const encoded = base64url('{"alg":"RS256","typ":"JWT"}');
  assert.equal(encoded.includes("="), false);
  assert.equal(encoded.includes("+"), false);
  assert.equal(encoded.includes("/"), false);
  assert.equal(Buffer.from(encoded, "base64url").toString(), '{"alg":"RS256","typ":"JWT"}');
});
