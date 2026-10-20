export function restorePosterParagraphs(current: string, source: string) {
 const plain = source.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\r\n/g, '\n').trim();
 const marker = 'GPSR — Manufacturer contact';
 const at = current.indexOf(marker);
 const base = at < 0 ? current : current.slice(0, at);
 const suffix = at < 0 ? '' : current.slice(at).trim();
 const normalize = (text: string) => text.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
 if (!plain || normalize(base) !== normalize(plain)) throw new Error('Etsy-Beschreibung inhaltlich abweichend. Keine manuellen Textänderungen überschrieben.');
 return plain + (suffix ? `\n\n${suffix}` : '');
}
