import { toGelatoHtml } from '../folder-input.js';
export interface GelatoProductInput { title: string; productTemplateId: string; artworkUrl: string }
export interface GelatoClient { createProduct(input: GelatoProductInput): Promise<{ id: string }> }
export interface GelatoTemplate {
  id: string;
  variants: Array<{ id: string; productUid?: string; variantOptions?: Array<{ name: string; value: string }>; imagePlaceholders: Array<{ name: string }> }>;
}
export interface GelatoPayload {
  templateId: string; title: string; description: string; tags: string[];
  isVisibleInTheOnlineStore: false;
  variants: Array<{ templateVariantId: string; imagePlaceholders: Array<{ name: string; fileUrl: string; fitMethod: 'meet' }> }>;
}
export interface GelatoProduct { id: string; status: string; externalId?: string | null; productVariantOptions?: Array<{ name: string; values: string[] }> }
export class GelatoHttpError extends Error {
  constructor(public status: number, method: string, detail: string) {
    super(`Gelato ${method}: HTTP ${status}${detail ? ` – ${detail}` : ''}`);
  }
}
export class GelatoApiClient {
  constructor(private apiKey: string, private storeId: string) {
    if (!apiKey || !storeId) throw new Error('GELATO_API_KEY und GELATO_STORE_ID fehlen.');
  }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://ecommerce.gelatoapis.com/v1${path}`, {
        method, headers: { 'X-API-KEY': this.apiKey, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name;
      throw new Error(`Gelato-Verbindungsfehler (${method}, ${code}). Kein automatischer Schreib-Wiederholungsversuch.`);
    }
    if (!response.ok) {
      // Redact links and credentials before exposing Gelato validation details.
      const raw = await response.text();
      const detail = raw.split(this.apiKey).join('[API-KEY]').replace(/https?:[^\s"<>]+/gi, '[URL]').slice(0, 1800);
      throw new GelatoHttpError(response.status, method, detail);
    }
    return response.json() as Promise<T>;
  }
  getTemplate(id: string) { return this.request<GelatoTemplate>(`/templates/${encodeURIComponent(id)}`); }
  createFromTemplate(payload: GelatoPayload) { return this.request<GelatoProduct>(`/stores/${encodeURIComponent(this.storeId)}/products:create-from-template`, 'POST', payload); }
  getProduct(id: string) { return this.request<GelatoProduct>(`/stores/${encodeURIComponent(this.storeId)}/products/${encodeURIComponent(id)}`); }
}
export function buildGelatoPayload(template: GelatoTemplate, input: { title: string; description: string; tags: string[] }, artworkUrl: string, placeholder: string, variantArtwork?: (variant: GelatoTemplate['variants'][number]) => { url: string; placeholder: string }): GelatoPayload {
  if (!template.variants?.length) throw new Error('Gelato-Vorlage enthält keine Varianten.');
  const variants = template.variants.map(variant => {
    // Every editable layer must be accounted for; never silently publish old template artwork.
    const chosen = variantArtwork?.(variant) ?? { url: artworkUrl, placeholder };
    const names = variant.imagePlaceholders?.map(p => p.name) ?? [];
    if (!variant.id || names.length !== 1 || names[0] !== chosen.placeholder) throw new Error(`Variante ${variant.id}: genau ein Bildplatzhalter namens ${placeholder} erforderlich. Gefunden: ${names.length ? names.join(", ") : "keiner"}. config/gelato-products.json und Vorlage prüfen.`);
    return { templateVariantId: variant.id, imagePlaceholders: [{ name: chosen.placeholder, fileUrl: chosen.url, fitMethod: 'meet' as const }] };
  });
  return { templateId: template.id, ...input, description: toGelatoHtml(input.description), isVisibleInTheOnlineStore: false, variants };
}

export function completeEtsySizeGrid(template: GelatoTemplate) {
  if (!template.variants.some(v => v.variantOptions?.length)) return { template, removedSizes: [] as string[] };
  const option = (v: GelatoTemplate['variants'][number], name: string) => v.variantOptions?.find(o => o.name.toLowerCase() === name)?.value;
  if (template.variants.some(v => !option(v, 'color') || !option(v, 'size') || v.variantOptions?.length !== 2)) throw new Error('Variantenprüfung: erwartet Color und Size. Vorlage prüfen.');
  const colors = [...new Set(template.variants.map(v => option(v, 'color')!))];
  const sizes = [...new Set(template.variants.map(v => option(v, 'size')!))];
  const common = sizes.filter(size => colors.every(color => template.variants.some(v => option(v, 'color') === color && option(v, 'size') === size)));
  if (!common.length) throw new Error('Keine Größe in allen Vorlagenfarben vorhanden. Gelato-Vorlage anpassen.');
  const variants = template.variants.filter(v => common.includes(option(v, 'size')!));
  if (variants.length !== colors.length * common.length) throw new Error('Doppelte Größen-/Farbkombinationen in der Gelato-Vorlage.');
  return { template: { ...template, variants }, removedSizes: sizes.filter(size => !common.includes(size)) };
}
