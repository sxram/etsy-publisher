import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseProductText } from '../src/folder-input.js';
import { buildGelatoPayload } from '../src/clients/gelato.js';
import { runFolder } from '../src/gelato-folder.js';
import { signStorageUrl } from '../src/artwork-storage.js';

const text = '**Title**\nMoon Fox, Woodland Art\n\n**Tags**\nfox shirt, woodland gift\n\n**Description**\nA whimsical fox design.';
const template = { id: 't1', variants: [{ id: 'v1', imagePlaceholders: [{ name: 'ImageFront' }] }, { id: 'v2', imagePlaceholders: [{ name: 'ImageFront' }] }] };
test('metadata accepts inline and Markdown fields without digital product additions', () => {
  const result = parseProductText(text);
  assert.equal(result.title, 'Moon Fox | Woodland Art');
  assert.deepEqual(result.tags, ['fox shirt', 'woodland gift']);
  assert.equal(result.description, 'A whimsical fox design.');
  assert.equal(parseProductText('Title: Moon Fox\nTags: fox shirt\nFox design.').title, 'Moon Fox');
  assert.throws(() => parseProductText('Title: Fox\nNo tags'), /erforderlich/);
  assert.throws(() => parseProductText('Title: Fox\nTags: this tag is much too long to use\nDescription.'), /Tags/);
});
test('template payload includes all variants, hidden visibility and non-cropping artwork', () => {
  const payload = buildGelatoPayload(template, parseProductText(text), 'https://art.example/image.png', 'ImageFront');
  assert.equal(payload.isVisibleInTheOnlineStore, false);
  assert.equal(payload.variants.length, 2);
  assert.equal(payload.variants[1]?.imagePlaceholders[0]?.fitMethod, 'meet');
  assert.throws(() => buildGelatoPayload({ id: 't', variants: [{ id: 'v', imagePlaceholders: [{ name: 'ImageFront' }, { name: 'ImageBack' }] }] }, parseProductText(text), 'https://example.com/art.png', 'ImageFront'), /Bildplatzhalter/);
});
test('signed storage URLs bind method, bucket, object and expiration', () => {
  const config = { endpoint: new URL('https://s3.example.com'), region: 'eu-central-1', bucket: 'art', accessKey: 'test', secret: 'secret', session: undefined };
  const now = new Date('2026-10-16T00:00:00Z');
  const get = new URL(signStorageUrl(config, 'GET', 'folder/a b.png', now));
  const put = new URL(signStorageUrl(config, 'PUT', 'folder/a b.png', now));
  assert.equal(get.pathname, '/art/folder/a%20b.png');
  assert.equal(get.searchParams.get('X-Amz-Expires'), '604800');
  assert.notEqual(get.searchParams.get('X-Amz-Signature'), put.searchParams.get('X-Amz-Signature'));
});
test('folder create/resume avoids duplicates and lost-response retries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'giggle-flow-'));
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let posts = 0; let fail = false;
  Object.assign(process.env, { GELATO_API_KEY: 'test', GELATO_STORE_ID: 's1', GELATO_TEMPLATE_TSHIRT: 't1', GELATO_S3_ENDPOINT: 'https://storage.example', GELATO_S3_BUCKET: 'art', GELATO_S3_ACCESS_KEY_ID: 'test', GELATO_S3_SECRET_ACCESS_KEY: 'secret' });
  globalThis.fetch = async (url, init) => {
    const address = String(url);
    if (address.includes('/templates/t1')) return Response.json(template);
    if (address.startsWith('https://storage.example/')) return new Response(null, { status: 200 });
    if (address.endsWith('products:create-from-template')) {
      posts++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.isVisibleInTheOnlineStore, false);
      if (fail) throw new TypeError('fetch failed');
      return Response.json({ id: 'p1', status: 'created' });
    }
    if (address.endsWith('/products/p1')) return Response.json({ id: 'p1', status: 'active', externalId: 'e1' });
    throw new Error('Unexpected request');
  };
  try {
    await writeFile(join(dir, 'image.png'), Buffer.from([137,80,78,71,13,10,26,10]));
    await writeFile(join(dir, 'description.md'), text);
    await runFolder(['create', '--dir', dir]);
    assert.equal(posts, 1);
    const saved = await readFile(join(dir, 'out/gelato/state.json'), 'utf8');
    assert.ok(!saved.includes('X-Amz'));
    await assert.rejects(runFolder(['create', '--dir', dir]), /doppelte/);
    await runFolder(['resume', '--dir', dir]);
    assert.equal(posts, 1);
    await writeFile(join(dir, 'description.md'), text + ' Changed.');
    await assert.rejects(runFolder(['resume', '--dir', dir]), /geändert/);
    await writeFile(join(dir, 'description.md'), text);
    await rm(join(dir, 'out/gelato/state.json'));
    fail = true;
    await assert.rejects(runFolder(['create', '--dir', dir]), /Verbindungsfehler/);
    assert.equal(posts, 2);
    await assert.rejects(runFolder(['resume', '--dir', dir]), /Ungewisser/);
    assert.equal(posts, 2);
  } finally { globalThis.fetch = originalFetch; process.env = originalEnv; await rm(dir, { recursive: true, force: true }); }
});
