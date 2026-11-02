import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
/** updatedAt can change when old mockups are republished; select the generation by createdAt. */
export interface ProductMockup { id: string; createdAt: string; updatedAt?: string; productVariantIds: string[]; fileUrl: string }
export interface MockupProduct { variants: { id: string; title: string }[]; productImages: ProductMockup[] }
export function latestMockupsByColor(product: MockupProduct) {
 const colors = new Map(product.variants.map(v => [v.id, /^Color (.+), Size .+$/.exec(v.title)?.[1]]));
 if ([...colors.values()].some(c => !c)) throw new Error('Ambiguous variant color.');
 const selected = new Map<string, ProductMockup>();
 for (const image of product.productImages) {
  if (!image.productVariantIds.length) continue; // Unassigned gallery images cannot identify a color.
  const names = new Set(image.productVariantIds.map(id => colors.get(id)));
  if (names.size !== 1 || names.has(undefined)) throw new Error('Mockup has no unique variant color.');
  if (!Number.isFinite(Date.parse(image.createdAt))) throw new Error('Mockup creation date missing.');
  const color = [...names][0]!;
  const old = selected.get(color);
  if (!old || Date.parse(image.createdAt) > Date.parse(old.createdAt)) selected.set(color, image);
 }
 for (const color of colors.values()) if (!selected.has(color!)) throw new Error(`Missing mockup: ${color}`);
 return selected;
}

/** Downloads a fresh generation without changing Gelato or Etsy. Inspect before upload. */
export async function prepareProductMockups(product: MockupProduct, directory: string) {
 await mkdir(directory,{recursive:true});
 const entries=[];
 for(const [color,image] of latestMockupsByColor(product)) {
  const response=await fetch(image.fileUrl,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Mockup download failed: ${color} (${response.status})`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const metadata=await sharp(bytes).metadata();
  if(metadata.format!=='jpeg'||!metadata.width||!metadata.height)throw new Error('Expected a complete JPEG mockup.');
  const file=join(directory,color.replace(/[^a-z0-9]+/gi,'_')+'.jpg');
  await writeFile(file,bytes);
  entries.push({color,file,gelatoImageId:image.id,createdAt:image.createdAt,width:metadata.width,height:metadata.height,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 await writeFile(join(directory,'report.json'),JSON.stringify({selection:'latest-created-generation-per-color',reviewRequired:true,entries},null,2));
 return entries;
}
