import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile, open, unlink } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getListing, getMyShop, etsyFetch } from "./etsy.js";
import { validateStyle } from "./watermark-image.js";
const args = process.argv.slice(2);
function arg(key: string) { const i=args.indexOf(key); if(i<0)return undefined; const v=args[i+1]; if(!v||v.startsWith("--"))throw new Error(`Missing ${key}`); return v; }
async function exists(path: string) { try { await access(path); return true; } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return false; throw error; } }
async function run(script: string, command: string, options: string[]) {
 const path = join(dirname(fileURLToPath(import.meta.url)), script);
 await new Promise<void>((resolveRun,reject) => {
  const child=spawn(process.execPath,["--import","tsx",path,command,...options],{stdio:"inherit"});
  child.once("error",reject); child.once("exit",code=>code===0?resolveRun():reject(new Error(`${script} ${command} stopped (${code}). Keep the output folder; rerun this same article command after resolving the reported issue.`)));
 });
}
async function stage(script: string, dir: string, listing: string, extra: string[]) {
 const manifest=join(dir,"manifest.json");
 if(!await exists(manifest)) await run(script,"prepare",["--listing",listing,"--dir",dir,...extra]);
 const m=JSON.parse(await readFile(manifest,"utf8"));
 if(!Array.isArray(m.entries)||m.entries.length===0||m.entries.some((e:{listingId:number})=>String(e.listingId)!==listing))throw new Error("Stage manifest does not belong exclusively to this listing.");
 if(m.entries.some((e:{status:string})=>e.status==='restored'))throw new Error("This run contains restored images. Use a new --dir only after all previous steps have been reverted.");
 if(m.entries.some((e:{status:string})=>['pending','restoring'].includes(e.status))) {
  if(script==='watermark.ts')throw new Error(`Watermark upload outcome uncertain. Inspect ${manifest}; no upload retried.`);
  await run(script,"reconcile",["--dir",dir]);
 }
 await run(script,"apply",["--dir",dir]);
}
async function main() {
 for(let i=0;i<args.length;i++) { if(!['--listing','--dir','--opacity','--text'].includes(args[i]))throw new Error(`Unknown option ${args[i]}`); arg(args[i]); i++; }
 const id=arg('--listing'); if(!id||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<=0)throw new Error('Provide --listing with a positive Etsy listing ID.');
 const opacity=Number(arg('--opacity')||process.env.WATERMARK_OPACITY||'0.14');
 const text=arg('--text')||process.env.WATERMARK_TEXT||'GigglingHome';validateStyle(text,opacity);
 const dir=resolve(arg('--dir')||`out/article-${id}`);await mkdir(dir,{recursive:true});
 const lockPath=join(dir,'.article-lock');const lock=await open(lockPath,'wx').catch(()=>{throw new Error('Another article run is active. Remove .article-lock after a crash only once the process has stopped.');});
 try {
  const shop=await getMyShop(), listing=await getListing(Number(id));
  if(listing.shop_id!==shop.shop_id)throw new Error('Listing is not in your shop.');
  const sections=await etsyFetch<{results:Array<{title:string;shop_section_id:number}>}>(`/application/shops/${shop.shop_id}/sections`);
  const section=sections.results.find(s=>s.shop_section_id===listing.shop_section_id)?.title.trim();
  if(!section||!['Poster','Poster-Digital','Coloring Books'].includes(section))throw new Error('Listing must be in Poster, Poster-Digital or Coloring Books.');
  const statePath=join(dir,'article.json');
  const state={listingId:Number(id),shopId:shop.shop_id,section,text,opacity};
  if(await exists(statePath)) {
   const saved=JSON.parse(await readFile(statePath,'utf8'));
   if(saved.listingId!==state.listingId||saved.shopId!==state.shopId||saved.section!==state.section||(section!=='Coloring Books'&&(saved.text!==text||saved.opacity!==opacity)))throw new Error('Run settings changed. Resume with the original settings and directory.');
  } else await writeFile(statePath,JSON.stringify(state,null,2));
  const shippingPath = join(dir, 'shipping-check.json');
  if (section === 'Poster' && (listing.type || listing.listing_type) !== 'download') {
   await writeFile(shippingPath,JSON.stringify({status:'pending',listingId:Number(id)},null,2));
   console.log('Etsy-Versandziele automatisch prüfen und Länderausschlüsse anwenden …');
   try {
    const { runShipping } = await import('./shipping-exclusions.js');
    await runShipping(['apply','--confirm','--listing',id,'--expected-shop',String(shop.shop_id)]);
    await writeFile(shippingPath,JSON.stringify({status:'verified',listingId:Number(id),checkedAt:new Date().toISOString()},null,2));
   } catch(error) {
    await writeFile(shippingPath,JSON.stringify({status:'pending',listingId:Number(id),message:error instanceof Error?error.message:'Versandprüfung fehlgeschlagen'},null,2));
    throw error;
   }
  } else if ((listing.type || listing.listing_type) === 'download') console.log('Digitaler Artikel: Versand-Länderausschlüsse nicht erforderlich.');
  else console.log(`Keine automatische Versandregel für Abteilung ${section} konfiguriert.`);
  console.log(`Processing ${id} in ${section}. Etsy images will be updated; listing state and download files stay unchanged.`);
  if(section==='Coloring Books') await stage('book-mockup.ts',join(dir,'book-mockup'),id,[]);
  else {
   await stage('watermark.ts',join(dir,'watermark'),id,['--text',text,'--opacity',String(opacity)]);
   // Deliberately frame the newly watermarked first image, as requested.
   await stage('mockup.ts',join(dir,'mockup'),id,[]);
  }
  console.log(`Article ${id} complete. Keep backups and manifests in ${dir}.`);
 } finally {await lock.close();await unlink(lockPath);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
