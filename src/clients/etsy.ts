import { createHash, randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

export interface EtsyConfig { apiKey: string; sharedSecret: string; shopId: string; redirectUri: string; tokenFile: string }
const tokenSchema = z.object({ access_token: z.string().regex(/^\d+\..+$/), refresh_token: z.string().min(1), token_type: z.literal('Bearer'), expires_in: z.number().int().positive(), scope: z.string().optional() });
const storedSchema = tokenSchema.extend({ expiresAt: z.number(), shopId: z.string(), apiKey: z.string() });
type Tokens = z.infer<typeof storedSchema>;
export function beginAuthorization(config: EtsyConfig) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const url = new URL('https://www.etsy.com/oauth/connect');
  url.search = new URLSearchParams({ response_type: 'code', client_id: config.apiKey, redirect_uri: config.redirectUri, scope: 'shops_r listings_r listings_w', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
  return { url: url.href, state, verifier, createdAt: Date.now() };
}
export function callbackCode(config: EtsyConfig, pending: ReturnType<typeof beginAuthorization>, callback: string) {
  const url = new URL(callback);
  const expected = new URL(config.redirectUri);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== pending.state || Date.now() - pending.createdAt > 600_000) throw new Error('Invalid or expired Etsy OAuth callback');
  if (url.searchParams.has('error')) throw new Error('Etsy authorization was denied');
  const code = url.searchParams.get('code');
  if (!code || url.searchParams.getAll('code').length !== 1) throw new Error('Missing Etsy authorization code');
  return code;
}
export class EtsyApiClient {
  private refreshing?: Promise<Tokens>;
  constructor(private config: EtsyConfig, private fetcher: typeof fetch = fetch) {}
  private async request(url: string, init: RequestInit = {}) {
    const response = await this.fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { ...init.headers, 'x-api-key': `${this.config.apiKey}:${this.config.sharedSecret}` } });
    if (!response.ok) throw new Error(`Etsy request failed (HTTP ${response.status})`);
    return response.json();
  }
  private async grant(params: Record<string, string>) {
    return tokenSchema.parse(await this.request('https://api.etsy.com/v3/public/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, client_id: this.config.apiKey }) }));
  }
  private async save(tokens: z.infer<typeof tokenSchema>) {
    const stored: Tokens = { ...tokens, expiresAt: Date.now() + tokens.expires_in * 1000, shopId: this.config.shopId, apiKey: this.config.apiKey };
    await mkdir(dirname(this.config.tokenFile), { recursive: true, mode: 0o700 });
    const temporary = `${this.config.tokenFile}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600, flag: 'wx' });
    await rename(temporary, this.config.tokenFile);
    await chmod(this.config.tokenFile, 0o600);
    return stored;
  }
  private async verifyOwner(accessToken: string) {
    const userId = accessToken.split('.')[0]!;
    const shop = z.object({ shop_id: z.number().int().positive(), user_id: z.number().int().positive() }).parse(await this.request(`https://api.etsy.com/v3/application/users/${userId}/shops`, { headers: { Authorization: `Bearer ${accessToken}` } }));
    if (String(shop.shop_id) !== this.config.shopId || String(shop.user_id) !== userId) throw new Error('Authorized Etsy account does not own the configured shop');
  }
  async connect(code: string, verifier: string) {
    const tokens = await this.grant({ grant_type: 'authorization_code', redirect_uri: this.config.redirectUri, code, code_verifier: verifier });
    if (tokens.scope && !tokens.scope.split(' ').includes('listings_r')) throw new Error('Etsy did not grant listings_r');
    await this.verifyOwner(tokens.access_token);
    await this.save(tokens);
  }
  private async tokens(): Promise<Tokens> {
    const stored = storedSchema.parse(JSON.parse(await readFile(this.config.tokenFile, 'utf8')));
    if (stored.shopId !== this.config.shopId || stored.apiKey !== this.config.apiKey) throw new Error('Etsy configuration changed; reconnect the shop');
    if (stored.expiresAt > Date.now() + 60_000) return stored;
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const tokens = await this.grant({ grant_type: 'refresh_token', refresh_token: stored.refresh_token });
        if (tokens.access_token.split('.')[0] !== stored.access_token.split('.')[0]) throw new Error('Etsy token owner changed');
        return this.save(tokens);
      })().finally(() => { this.refreshing = undefined; });
    }
    return this.refreshing;
  }
  async finishDraft(listingId: string, description: string, taxonomyId: number, sectionName?: string) {
    if (!/^[1-9]\d*$/.test(listingId) || !Number.isSafeInteger(taxonomyId) || taxonomyId <= 0) throw new Error('Invalid Etsy listing/category ID');
    const tokens = await this.tokens();
    if (tokens.scope && !tokens.scope.split(' ').includes('listings_w')) throw new Error('Etsy-Schreibberechtigung fehlt. npm run etsy:connect erneut ausführen.');
    await this.verifyOwner(tokens.access_token);
    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const url = `https://api.etsy.com/v3/application/shops/${this.config.shopId}/listings/${listingId}`;
    const read = () => this.request(`https://api.etsy.com/v3/application/listings/${listingId}`, { headers });
    const before = z.object({ shop_id: z.number(), state: z.string() }).passthrough().parse(await read());
    if (String(before.shop_id) !== this.config.shopId || before.state !== 'draft') throw new Error('Automatische Korrektur nur für eigene Etsy-Entwürfe erlaubt.');
    const partnerData = z.object({ results: z.array(z.object({ production_partner_id: z.number().int().positive(), partner_name: z.string() }).passthrough()) }).parse(await this.request(`https://api.etsy.com/v3/application/shops/${this.config.shopId}/production-partners`, { headers }));
    const partners = partnerData.results.filter(p => p.partner_name.trim().toLowerCase() === 'gelato');
    const body = new URLSearchParams({ taxonomy_id: String(taxonomyId), description: description.replace(/\*\*([^*]+)\*\*/g, '$1') });
    let sectionId: number | undefined;
    if (sectionName) {
      const sections = z.object({ results: z.array(z.object({ shop_section_id: z.number().int().positive(), title: z.string() })) }).parse(await this.request(`https://api.etsy.com/v3/application/shops/${this.config.shopId}/sections`, { headers }));
      const matches = sections.results.filter(s => s.title === sectionName);
      if (matches.length !== 1) throw new Error(`Shop-Abteilung "${sectionName}" fehlt oder ist nicht eindeutig. Bitte in Etsy anlegen.`);
      sectionId = matches[0]!.shop_section_id;
      body.set('shop_section_id', String(sectionId));
    }
    if (partners.length === 1) {
      const previous = Array.isArray(before.production_partner_ids) ? before.production_partner_ids.filter((id): id is number => typeof id === 'number' && Number.isInteger(id)) : [];
      body.set('production_partner_ids', [...new Set([...previous, partners[0]!.production_partner_id])].join(','));
    }
    await this.request(url, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const after = z.object({ state: z.string(), taxonomy_id: z.number(), description: z.string(), shop_section_id: z.number().nullable().optional() }).parse(await read());
    if (sectionId && after.shop_section_id !== sectionId) throw new Error('Etsy-Shop-Abteilung konnte nicht bestätigt werden.');
    if (after.state !== 'draft' || after.taxonomy_id !== taxonomyId) throw new Error('Etsy-Korrektur konnte nicht bestätigt werden.');
    if (description.includes('\n\n') && !after.description.includes('\n\n')) throw new Error('Etsy hat die Absatzabstände nicht übernommen.');
    return { listingId, productionPartnerAssigned: partners.length === 1 };
  }
  async listDrafts(limit = 25, offset = 0) {
    const tokens = await this.tokens();
    await this.verifyOwner(tokens.access_token);
    const data = z.object({ count: z.number().int().nonnegative(), results: z.array(z.object({ listing_id: z.number().int().positive(), title: z.string(), state: z.string() })) }).parse(await this.request(`https://api.etsy.com/v3/application/shops/${this.config.shopId}/listings?state=draft&limit=${limit}&offset=${offset}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }));
    return { shopId: this.config.shopId, count: data.count, limit, offset, drafts: data.results.filter(x => x.state === 'draft').map(x => ({ id: String(x.listing_id), title: x.title })) };
  }
}
