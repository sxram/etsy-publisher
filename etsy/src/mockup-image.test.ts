import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMainMockup } from "./mockup-image.js";
test("preserves entire portrait and landscape including border; leaves source unchanged", async () => {
 const dir = await mkdtemp(join(tmpdir(), "mockup-image-"));
 try {
  for (const [w, h] of [[300, 400], [400, 300]]) {
   const src=join(dir, "src.png"), out=join(dir,"out.jpg");
   await sharp({create:{width:w,height:h,channels:3,background:"#ec4869"}}).extend({top:10,bottom:10,left:10,right:10,background:"white"}).png().toFile(src);
   const original=await readFile(src); await createMainMockup(src,out,true);
   assert.deepEqual(await readFile(src),original);
   const m=await sharp(out).metadata();assert.equal(m.width,2400);assert.equal(m.height,2400);
   const {data}=await sharp(out).raw().toBuffer({resolveWithObject:true});
   const ratio=(w+20)/(h+20), height=Math.round(Math.min(1910,2030/ratio)), width=Math.round(height*ratio);
   const left=Math.round((2400-width)/2), top=2090-46-height;
   for(const [x,y] of [[left+3,top+3],[left+width-4,top+height-4]]) {
    const i=(y*2400+x)*3;assert.ok(data[i]>230 && data[i+1]>230 && data[i+2]>230,"white border preserved at both corners");
   }
  }
 } finally { await rm(dir,{recursive:true,force:true}); }
});
