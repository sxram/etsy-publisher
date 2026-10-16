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
export interface GelatoProduct { id: string; status: string; externalId?: string | null }
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
    // Response bodies can contain private signed artwork URLs. Do not log them.
    if (!response.ok) throw new Error(`Gelato ${method}: HTTP ${response.status}. Details im Gelato-Dashboard prüfen.`);
    return response.json() as Promise<T>;
  }
  getTemplate(id: string) { return this.request<GelatoTemplate>(`/templates/${encodeURIComponent(id)}`); }
  createFromTemplate(payload: GelatoPayload) { return this.request<GelatoProduct>(`/stores/${encodeURIComponent(this.storeId)}/products:create-from-template`, 'POST', payload); }
  getProduct(id: string) { return this.request<GelatoProduct>(`/stores/${encodeURIComponent(this.storeId)}/products/${encodeURIComponent(id)}`); }
}
export function buildGelatoPayload(template: GelatoTemplate, input: { title: string; description: string; tags: string[] }, artworkUrl: string, placeholder: string): GelatoPayload {
  if (!template.variants?.length) throw new Error('Gelato-Vorlage enthält keine Varianten.');
  const variants = template.variants.map(variant => {
    // Every editable layer must be accounted for; never silently publish old template artwork.
    const names = variant.imagePlaceholders?.map(p => p.name) ?? [];
    if (!variant.id || names.length !== 1 || names[0] !== placeholder) throw new Error(`Variante ${variant.id}: genau ein Bildplatzhalter namens ${placeholder} erforderlich. Vorlage prüfen.`);
    return { templateVariantId: variant.id, imagePlaceholders: [{ name: placeholder, fileUrl: artworkUrl, fitMethod: 'meet' as const }] };
  });
  return { templateId: template.id, ...input, isVisibleInTheOnlineStore: false, variants };
}
