import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { processPoster } from "./poster-process.js";

test("combined pipeline creates first, processes saved ID, and reuses existing draft on restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "poster-pipeline-"));
  try {
    await writeFile(join(dir, "art.png"), "fixture");
    await writeFile(join(dir, "text.md"), "Title: Forest\nTags: forest art\nForest.");
    const output = join(dir, "out", "new-posters", "art");
    const manifest = join(output, "listing.json");
    const calls: Array<{ script: string; args: string[] }> = [];
    let processingFails = true;
    const runner = async (script: string, args: string[]) => {
      calls.push({ script, args });
      if (script === "new-poster.ts") await writeFile(manifest, JSON.stringify({ listingId: 123, etsyStatus: "needs_ai_disclosure" }));
      else if (processingFails) throw new Error("processing failure");
    };
    await assert.rejects(processPoster(["--dir", dir], runner), /processing failure/);
    assert.deepEqual(calls.map(c => c.script), ["new-poster.ts", "process-article.ts"]);
    assert.ok(calls[1].args.includes("123"));
    assert.ok(calls[1].args.includes(join(output, "processing")));
    processingFails = false; calls.length = 0;
    await processPoster(["--dir", dir], runner);
    assert.deepEqual(calls.map(c => c.script), ["process-article.ts"]);
    await writeFile(manifest, JSON.stringify({ listingId: 123, etsyStatus: "uploading" }));
    calls.length = 0;
    await processPoster(["--dir", dir], runner);
    assert.ok(calls[0].args.includes("--resume"));
    assert.equal(calls[1].script, "process-article.ts");
    await assert.rejects(readFile(join(output, ".poster-process-lock")), { code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("creation failure prevents processing; invalid options and active locks prevent all operations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "poster-stop-"));
  try {
    await writeFile(join(dir, "art.jpg"), "fixture");
    await writeFile(join(dir, "text.txt"), "Forest");
    const calls: string[] = [];
    const runner = async (script: string) => { calls.push(script); throw new Error("creation failure"); };
    await assert.rejects(processPoster(["--dir", dir], runner), /creation failure/);
    assert.deepEqual(calls, ["new-poster.ts"]);
    calls.length = 0;
    await assert.rejects(processPoster(["--dir", dir, "--opacity", "99"], runner));
    assert.deepEqual(calls, []);
    const output = join(dir, "out", "new-posters", "art");
    await mkdir(output, { recursive: true });
    await writeFile(join(output, ".poster-process-lock"), "locked");
    await assert.rejects(processPoster(["--dir", dir], runner), /Gesamtlauf/);
    assert.deepEqual(calls, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
