import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBookMockup } from "./book-mockup-image.js";
test("renders paperback without cropping cover and leaves source unchanged", async () => {
 const dir=await mkdtemp(join(tmpdir(),"book-render-"));
 try {
  const src=join(dir,"cover.png"),out=join(dir,"mockup.jpg");
  await sharp({create:{width:700,height:1000,channels:3,background:"#ebcc99"}}).png().toFile(src);
  const before=await readFile(src); await createBookMockup(src,out,true);
  assert.deepEqual(await readFile(src),before);
  const meta=await sharp(out).metadata();assert.equal(meta.width,2400);assert.equal(meta.height,2400);
  const {data}=await sharp(out).raw().toBuffer({resolveWithObject:true});
  let coverPixels=0;
  for(let i=0;i<data.length;i+=3) if(Math.abs(data[i]-235)<8 && Math.abs(data[i+1]-204)<8 && Math.abs(data[i+2]-153)<8) coverPixels++;
  assert.ok(coverPixels>1500000,"complete large cover remains visible after rotation");
 } finally {await rm(dir,{recursive:true,force:true});}
});
