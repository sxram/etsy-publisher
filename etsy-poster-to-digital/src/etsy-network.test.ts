import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchEtsyResponse } from "./etsy.js";

test("network error reports method, endpoint and cause without retrying writes", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
  };
  try {
    await assert.rejects(fetchEtsyResponse("https://api.etsy.com/v3/application/shops/1/listings?secret=hidden", { method: "POST" }), error => {
      assert.match((error as Error).message, /POST api\.etsy\.com\/v3\/application\/shops\/1\/listings \(ECONNRESET\)/);
      assert.doesNotMatch((error as Error).message, /hidden/);
      return true;
    });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
