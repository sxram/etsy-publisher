import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GelatoApiClient, GelatoHttpError } from '../src/clients/gelato.js';
test('Gelato validation errors include details while redacting URLs and API keys', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: 'Invalid fileUrl https://example.com/private?secret=token', key: 'api-secret' }, { status: 400 });
  try {
    await assert.rejects(new GelatoApiClient('api-secret', 'store').getTemplate('template'), error => {
      assert.ok(error instanceof GelatoHttpError);
      assert.equal(error.status, 400);
      assert.match(error.message, /Invalid fileUrl/);
      assert.doesNotMatch(error.message, /api-secret|example.com|secret=token/);
      return true;
    });
  } finally { globalThis.fetch = original; }
});
