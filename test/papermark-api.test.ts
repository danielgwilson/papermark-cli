import test from "node:test";
import assert from "node:assert/strict";
import { buildCookieHeader } from "../src/papermark-api.js";

test("buildCookieHeader includes session and csrf cookies", () => {
  const header = buildCookieHeader({
    sessionToken: "session-token",
    csrfToken: "csrf-token",
    baseUrl: "https://app.papermark.com",
  });

  assert.match(header, /__Secure-next-auth\.session-token=session-token/);
  assert.match(header, /__Host-next-auth\.csrf-token=csrf-token/);
});
