import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapGelatoColors, previewColorMockups } from './color-mockups.js';
import { ensureEtsyColorMockups } from './etsy-shipping.js';
export async function ensureProductColorMockups(listingId: string, folder: string, colors: string[]) {
 const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
 const source=JSON.parse(await readFile(join(root,'assets/mockups/gildan-5000b/sources.json'),'utf8')) as {gelatoColorAliases:Record<string,string|null>};
 const selected=mapGelatoColors(colors,source.gelatoColorAliases);
 if(!selected.length) throw new Error('Keine angebotenen Shirtfarben gefunden.');
 const report=await previewColorMockups(folder,selected);
 if(!report.readyForUpload) throw new Error('Druckplatzierung noch nicht freigegeben.');
 if(!report.overviewFiles.length) throw new Error('Keine Farbübersichten erzeugt.');
 await ensureEtsyColorMockups(listingId,join(resolve(folder),'out/color-mockups/report.json'));
}
