import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { appendColorImages, type GalleryImage } from './color-image-upload.js';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function fixture() {
 const dir=await mkdtemp(join(tmpdir(),'colors-upload-'));const source=Buffer.from('original');await writeFile(join(dir,'source.png'),source);
 const files=[Buffer.from([255,216,1]),Buffer.from([255,216,2])];for(const [i,b] of files.entries())await writeFile(join(dir,`${i}.jpg`),b);
 const report=join(dir,'report.json');await writeFile(report,JSON.stringify({model:'Gildan 5000B',readyForUpload:true,sourceImage:join(dir,'source.png'),sourceSha256:hash(source),overviewFiles:files.map((_,i)=>join(dir,`${i}.jpg`)),overviewSha256:files.map(hash)}));return {dir,report};
}
test('append preserves all eight originals and a repeated run uploads nothing',async()=>{
 const {dir,report}=await fixture();try{
 const images:GalleryImage[]=Array.from({length:8},(_,i)=>({listing_image_id:i+1,rank:i+1}));let posts=0;
 const client={list:async()=>images.map(i=>({...i})),upload:async(_b:Buffer,rank:number,alt:string)=>{posts++;const i={listing_image_id:100+posts,rank,alt_text:alt};images.push(i);return i;}};
 assert.equal((await appendColorImages(report,1,2,client,false)).pending,2);assert.equal(posts,0);
 assert.equal((await appendColorImages(report,1,2,client,true)).added,2);assert.equal(images.length,10);assert.equal(posts,2);
 assert.deepEqual(images.slice(0,8).map(i=>[i.listing_image_id,i.rank]),Array.from({length:8},(_,i)=>[i+1,i+1]));
 assert.equal((await appendColorImages(report,1,2,client,true)).added,0);assert.equal(posts,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('lost response reconciles by marker; unresolved POST is not retried',async()=>{
 const {dir,report}=await fixture();try{
 const images:GalleryImage[]=[{listing_image_id:1,rank:1}];let posts=0;
 const client={list:async()=>images.map(i=>({...i})),upload:async(_b:Buffer,rank:number,alt:string)=>{posts++;if(posts===1){images.push({listing_image_id:11,rank,alt_text:alt});throw new Error('network lost');}throw new Error('network lost before result');}};
 await assert.rejects(appendColorImages(report,1,2,client,true),/network/);assert.equal(posts,2);
 await assert.rejects(appendColorImages(report,1,2,client,true),/Ungewisser/);assert.equal(posts,2);
 const saved=JSON.parse(await readFile(join(dir,'etsy-upload-2.json'),'utf8'));assert.equal(saved.entries[0].status,'done');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('capacity and changed local content refuse uploads before POST',async()=>{
 const {dir,report}=await fixture();try{
 let posts=0;const client={list:async()=>Array.from({length:19},(_,i)=>({listing_image_id:i+1,rank:i+1})),upload:async()=>{posts++;return {listing_image_id:90};}};
 await assert.rejects(appendColorImages(report,1,2,client,true),/mehr als 20/);assert.equal(posts,0);
 await writeFile(join(dir,'0.jpg'),Buffer.from([255,216,9]));await assert.rejects(appendColorImages(report,1,2,client,true),/Übersicht seit/);assert.equal(posts,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('explicit refresh replaces only tracked overviews at their ranks and retains eight originals',async()=>{
 const {dir,report}=await fixture();try{
 const images:GalleryImage[]=Array.from({length:8},(_,i)=>({listing_image_id:i+1,rank:i+1}));let posts=0;
 const client={list:async()=>images.map(i=>({...i})),upload:async(_b:Buffer,rank:number,alt:string,overwrite?:boolean)=>{posts++;if(overwrite){const index=images.findIndex(i=>i.rank===rank);assert.ok(index>=8);images.splice(index,1);}const image={listing_image_id:100+posts,rank,alt_text:alt};images.push(image);return image;}};
 await appendColorImages(report,1,2,client,true);
 const data=JSON.parse(await readFile(report,'utf8'));for(let i=0;i<2;i++){const bytes=Buffer.from([255,216,9+i]);await writeFile(join(dir,`${i}.jpg`),bytes);data.overviewSha256[i]=hash(bytes);}await writeFile(report,JSON.stringify(data));
 await assert.rejects(appendColorImages(report,1,2,client,true),/refresh-managed/);assert.equal(posts,2);
 await appendColorImages(report,1,2,client,true,true);assert.equal(posts,4);assert.equal(images.length,10);
 assert.deepEqual(images.filter(i=>i.rank!<=8).map(i=>i.listing_image_id),[1,2,3,4,5,6,7,8]);
 await appendColorImages(report,1,2,client,true);assert.equal(posts,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
