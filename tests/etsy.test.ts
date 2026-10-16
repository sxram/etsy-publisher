import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { beginAuthorization, callbackCode, EtsyApiClient, type EtsyConfig } from '../src/clients/etsy.js';
import { loadConfig } from '../src/config.js';
const config: EtsyConfig = { apiKey: 'key', sharedSecret: 'secret', shopId: '42', redirectUri: 'https://example.com/callback', tokenFile: '' };
test('OAuth uses S256 and rejects wrong, expired, duplicate and denied callbacks', () => {
  const pending = beginAuthorization(config);
  const url = new URL(pending.url);
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.equal(url.searchParams.get('scope'), 'shops_r listings_r');
  const callback = `${config.redirectUri}?state=${pending.state}&code=code`;
  assert.equal(callbackCode(config, pending, callback), 'code');
  for (const value of [callback.replace('example.com', 'evil.com'), callback.replace(pending.state, 'wrong'), `${callback}&state=another`, `${callback}&error=access_denied`]) assert.throws(() => callbackCode(config, pending, value));
  assert.throws(() => callbackCode(config, { ...pending, createdAt: Date.now() - 601000 }, callback));
});
test('Etsy configuration is opt-in and rejects public hosting or incomplete credentials', () => {
  assert.equal(loadConfig({}).etsy, undefined);
  assert.throws(() => loadConfig({ ETSY_ENABLED: 'true' }));
  const env = { ETSY_ENABLED: 'true', ETSY_API_KEY: 'key', ETSY_SHARED_SECRET: 'secret', ETSY_SHOP_ID: '42', ETSY_REDIRECT_URI: config.redirectUri };
  assert.ok(loadConfig(env).etsy);
  assert.throws(() => loadConfig({ ...env, HOST: '0.0.0.0' }));
  assert.throws(() => loadConfig({ ...env, ALLOWED_HOSTS: 'public.example' }));
});
test('grant, ownership check, private persistence, refresh single-flight and draft pagination', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'etsy-test-'));
  const local = { ...config, tokenFile: join(directory, 'tokens.json') };
  let refreshes = 0;
  let wrongOwner = false;
  const fake = (async (input, init) => {
    assert.equal((init!.headers as Record<string, string>)['x-api-key'], 'key:secret');
    const url = String(input);
    if (url.endsWith('/oauth/token')) {
      const body = init!.body as URLSearchParams;
      assert.equal(body.get('client_id'), 'key');
      if (body.get('grant_type') === 'refresh_token') { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); }
      else { assert.equal(body.get('code_verifier'), 'verifier'); assert.equal(body.get('redirect_uri'), config.redirectUri); }
      return Response.json({ access_token: '7.access', refresh_token: '7.refresh', token_type: 'Bearer', expires_in: 3600, scope: 'shops_r listings_r' });
    }
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer 7.access');
    if (url.endsWith('/users/7/shops')) return Response.json({ shop_id: wrongOwner ? 99 : 42, user_id: 7 });
    assert.ok(url.endsWith('/shops/42/listings?state=draft&limit=10&offset=20'));
    return Response.json({ count: 2, results: [{ listing_id: 1, title: 'Draft', state: 'draft' }, { listing_id: 2, title: 'Other', state: 'edit' }] });
  }) as typeof fetch;
  try {
    const client = new EtsyApiClient(local, fake);
    wrongOwner = true;
    await assert.rejects(client.connect('code', 'verifier'), /does not own/);
    await assert.rejects(readFile(local.tokenFile));
    wrongOwner = false;
    await client.connect('code', 'verifier');
    assert.equal((await stat(local.tokenFile)).mode & 0o777, 0o600);
    const stored = JSON.parse(await readFile(local.tokenFile, 'utf8'));
    await writeFile(local.tokenFile, JSON.stringify({ ...stored, expiresAt: 0 }));
    const results = await Promise.all([client.listDrafts(10, 20), client.listDrafts(10, 20)]);
    assert.equal(refreshes, 1);
    assert.deepEqual(results[0]!.drafts, [{ id: '1', title: 'Draft' }]);
    wrongOwner = true;
    await assert.rejects(client.listDrafts(10, 20), /does not own/);
    const failing = new EtsyApiClient(local, (async () => new Response('secret provider error', { status: 403 })) as typeof fetch);
    await assert.rejects(failing.connect('code', 'verifier'), error => error instanceof Error && error.message === 'Etsy request failed (HTTP 403)');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
