import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { getMyShop, getListing, etsyFetch } from './etsy.js';
import { isPhysicalListing } from './gpsr-text.js';
import { restorePosterParagraphs } from './poster-description-text.js';
async function main() {
 const args=process.argv.slice(2);
 const value=(key:string)=>{const i=args.indexOf(key); return i<0?undefined:args[i+1];};
 const id=value('--listing'), file=value('--description'), previous=value('--previous-description'), tagsFile=value('--tags');
 if(!id||! /^[1-9]\d*$/.test(id)||!file)throw new Error('--listing ID --description FILE erforderlich.');
 const shop=await getMyShop(), before=await getListing(Number(id));
 if(before.shop_id!==shop.shop_id||!isPhysicalListing(before)||!['draft','active'].includes(before.state))throw new Error('Eigener physischer Entwurf/aktiver Artikel erforderlich.');
 const title=value('--title');if(title!==undefined&&(!title.trim()||title.length>140))throw new Error('Ungültiger Titel.');
 const sectionName=value('--section'), taxonomy=value('--taxonomy');
 let sectionId:number|undefined;
 if(sectionName){const sections=await etsyFetch<{results:{shop_section_id:number;title:string}[]}>(`/application/shops/${shop.shop_id}/sections`);const matches=sections.results.filter(x=>x.title===sectionName);if(matches.length!==1)throw new Error('Shop-Abteilung nicht eindeutig.');sectionId=matches[0]!.shop_section_id;}
 if(taxonomy&&!/^[1-9]\d*$/.test(taxonomy))throw new Error('Ungültige Kategorie.');
 const description=restorePosterParagraphs(before.description??'',await readFile(resolve(file),'utf8'),previous?await readFile(resolve(previous),'utf8'):undefined);
 const tags: unknown=tagsFile?JSON.parse(await readFile(resolve(tagsFile),'utf8')):undefined;
 if(tags!==undefined&&(!Array.isArray(tags)||!tags.length||tags.length>13||tags.some(t=>typeof t!=='string'||!t.trim()||t.length>20)||new Set(tags).size!==tags.length))throw new Error('Ungültige Etsy-Tags.');
 const expectedTags=tags as string[]|undefined;
 const sameTags=(actual:unknown)=>Array.isArray(actual)&&expectedTags?.length===actual.length&&expectedTags.every(t=>actual.includes(t));
 if((!title||before.title===title)&&description===before.description&&(!expectedTags||sameTags(before.tags))&&(!sectionId||before.shop_section_id===sectionId)&&(!taxonomy||before.taxonomy_id===Number(taxonomy))){console.log('Beschreibung, Zeilenumbrüche und Tags bestätigt.');return;}
 const out=resolve('out/product-description');await mkdir(out,{recursive:true});
 await writeFile(join(out,`${id}-${Date.now()}.json`),JSON.stringify({listingId:id,state:before.state,description:before.description,tags:before.tags},null,2),{mode:0o600});
 const latest=await getListing(Number(id));if(latest.description!==before.description||latest.state!==before.state||JSON.stringify(latest.tags)!==JSON.stringify(before.tags))throw new Error('Artikel zwischenzeitlich geändert.');
 const body=new URLSearchParams({description});if(title)body.set('title',title);
 if(sectionId)body.set('shop_section_id',String(sectionId));if(taxonomy)body.set('taxonomy_id',taxonomy);
 const partners=await etsyFetch<{results:{production_partner_id:number;partner_name:string}[]}>(`/application/shops/${shop.shop_id}/production-partners`);
 const gelato=partners.results.filter(p=>p.partner_name.trim().toLowerCase()==='gelato');
 if(gelato.length===1){const existing=(before as unknown as {production_partner_ids?:number[]}).production_partner_ids??[];body.set('production_partner_ids',[...new Set([...existing,gelato[0]!.production_partner_id])].join(','));}
if(expectedTags)body.set('tags',expectedTags.join(','));
 await etsyFetch(`/application/shops/${shop.shop_id}/listings/${id}`,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 const after=await getListing(Number(id));if((title&&after.title!==title)||(sectionId&&after.shop_section_id!==sectionId)||(taxonomy&&after.taxonomy_id!==Number(taxonomy))||after.description!==description||after.state!==before.state||(expectedTags&&!sameTags(after.tags)))throw new Error('Beschreibung/Tags nicht exakt bestätigt.');
 console.log(`Etsy ${id}: Beschreibung inklusive aller Zeilenumbrüche und Tags bestätigt; Status unverändert.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
