import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, cp, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

test("insert preserves original gallery, skips repeated apply, rejects changed gallery, restore removes only inserted image", async () => {
 const dir = await mkdtemp(join(tmpdir(), "book-mockup-flow-"));
 try {
  const token = { access_token: "123.fake", refresh_token: "fake", token_type: "Bearer", expires_in: 3600, obtained_at: Date.now() };
  await writeFile(join(dir, ".etsy-token.json"), JSON.stringify(token));
  await writeFile(join(dir, "preview.jpg"), "test-image");
  const manifest = { version: 1, kind: "book-mockup", shopId: 7, entries: [{ listingId: 8, title: "Poster", originalId: 9, rank: 1, original: "original.bin", preview: "preview.jpg", status: "prepared" }] };
  const path = join(dir, "manifest.json"); await writeFile(path, JSON.stringify(manifest));
  await cp(join(process.cwd(), "src"), join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  await symlink(join(process.cwd(), "node_modules"), join(dir, "node_modules"));
  const target = pathToFileURL(join(dir, "src/book-mockup.ts")).href;
  const fixture = join(dir, "fixture.mjs");
  await writeFile(fixture, `
let uploaded = ['restore','reconcile','duplicate'].includes(process.env.MODE); let staleReads = 0;
globalThis.fetch = async (url, options) => {
 const u = String(url); let data;
 if (u.endsWith('/users/123/shops')) data = { shop_id: 7 };
 else if (u.endsWith('/shops/7/sections')) data = { results: [{ title: 'Coloring Books', shop_section_id: 20 }] };
 else if (u.endsWith('/listings/8?includes=Images')) data = { shop_id: 7, listing_type: 'physical', shop_section_id: process.env.MODE === 'outside' ? 99 : 20 };
 else if (u.endsWith('/listings/8/images') && options?.method === 'POST') {
  if (!['apply','lag'].includes(process.env.MODE)) throw new Error('Unexpected upload');
  if (options.body.get('rank') !== '1' || options.body.get('overwrite') !== 'false' || !options.body.get('image')) throw new Error('Invalid multipart upload');
  uploaded = true; data = { listing_image_id: 10, rank: 1 };
 } else if (u.endsWith('/listings/8/images/10') && options?.method === 'DELETE') { uploaded = false; return new Response(null, { status: 204 }); }
 else if (u.endsWith('/listings/8/images')) data = { results: uploaded && !(process.env.MODE === 'lag' && staleReads++ === 0) ? [{ listing_image_id: 10, rank: 1 }, { listing_image_id: 9, rank: process.env.MODE === 'duplicate' ? 1 : 2 }, { listing_image_id: 11, rank: process.env.MODE === 'duplicate' ? 2 : 3 }] : [{ listing_image_id: process.env.MODE === 'changed' ? 99 : 9, rank: 1 }, { listing_image_id: 11, rank: 2 }] };
 else throw new Error('Unexpected endpoint: ' + u);
 return new Response(JSON.stringify(data), { status: 200 });
};
process.argv = ['node', 'fixture', process.env.MODE === 'restore' ? 'restore' : ['reconcile','duplicate'].includes(process.env.MODE) ? 'reconcile' : 'apply', '--dir', ${JSON.stringify(dir)}];
await import(${JSON.stringify(target)});
`);
  // Resolve tsx from this project while the child uses a clean working directory.
  const tsx = pathToFileURL(join(process.cwd(), "node_modules/tsx/dist/loader.mjs")).href;
  const execute = (mode: string) => spawnSync(process.execPath, ["--import", tsx, fixture], { cwd: dir, env: { ...process.env, ETSY_API_KEY: "fake", ETSY_SHARED_SECRET: "fake", MODE: mode }, encoding: "utf8" });
  const applied = execute("apply"); assert.equal(applied.status, 0, applied.stderr);
  const stored = JSON.parse(await readFile(path, "utf8")); assert.equal(stored.entries[0].status, "applied"); assert.equal(stored.entries[0].newId, 10);
  assert.deepEqual(stored.entries[0].previousIds, [9, 11]);
  assert.equal(stored.entries[0].operation, "insert");
  assert.equal(execute("skip").status, 0);
  stored.entries[0].status = "pending"; await writeFile(path, JSON.stringify(stored));
  const reconciled = execute("reconcile"); assert.equal(reconciled.status, 0, reconciled.stderr);
  assert.match(reconciled.stdout, /No images changed/);
  assert.equal(JSON.parse(await readFile(path, "utf8")).entries[0].status, "applied");
  stored.entries[0].status = "pending"; await writeFile(path, JSON.stringify(stored));
  const duplicate = execute("duplicate"); assert.equal(duplicate.status, 0, duplicate.stderr);
  assert.equal(JSON.parse(await readFile(path, "utf8")).entries[0].status, "applied");
  const restored = execute("restore"); assert.equal(restored.status, 0, restored.stderr);
  assert.equal(JSON.parse(await readFile(path, "utf8")).entries[0].status, "restored");
  await writeFile(path, JSON.stringify(manifest));
  const lag = execute("lag"); assert.equal(lag.status, 0, lag.stderr); assert.match(lag.stdout, /Waiting 1s/);
  assert.equal(JSON.parse(await readFile(path, "utf8")).entries[0].status, "applied");
  await writeFile(path, JSON.stringify(manifest));
  const outside = execute("outside"); assert.equal(outside.status, 1); assert.match(outside.stderr, /only Coloring Books/);
  const changed = execute("changed"); assert.equal(changed.status, 1); assert.match(changed.stderr, /changed/);
  const unchanged = JSON.parse(await readFile(path, "utf8")); assert.equal(unchanged.entries[0].status, "prepared");
 } finally { await rm(dir, { recursive: true, force: true }); }
});
