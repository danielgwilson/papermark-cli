import test from "node:test";
import assert from "node:assert/strict";
import { redactSessionToken } from "../src/config.js";

test("redactSessionToken keeps only a small prefix and suffix", () => {
  assert.equal(redactSessionToken("abcdefghijklmnopqrstuvwxyz"), "abcdef…wxyz");
});
