import { resolve } from 'node:path';
import type { EtsyConfig } from './clients/etsy.js';
export interface Config {
  etsy?: EtsyConfig;
  host: string;
  port: number;
  allowedHosts: string[];
  allowedOrigins: string[];
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
  const csv = (value: string) => value.split(',').map(x => x.trim()).filter(Boolean);
  const allowedHosts = csv(env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1');
  if (!allowedHosts.length || allowedHosts.some(x => !/^[a-zA-Z0-9.-]+$/.test(x))) {
    throw new Error('ALLOWED_HOSTS must contain explicit DNS names or IPv4 addresses');
  }
  const allowedOrigins = csv(env.ALLOWED_ORIGINS ?? 'http://localhost:6274,http://127.0.0.1:6274');
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths');
    }
  }
  const host = env.HOST ?? '127.0.0.1';
  let etsy: EtsyConfig | undefined;
  if (env.ETSY_ENABLED === 'true') {
    if (host !== '127.0.0.1' || allowedHosts.some(x => !['localhost', '127.0.0.1'].includes(x))) throw new Error('Etsy requires loopback-only hosting until MCP user authentication is implemented');
    for (const key of ['ETSY_API_KEY', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID', 'ETSY_REDIRECT_URI']) {
      if (!env[key]?.trim()) throw new Error(`${key} is required when Etsy is enabled`);
    }
    if (!/^[1-9]\d*$/.test(env.ETSY_SHOP_ID!)) throw new Error('ETSY_SHOP_ID must be a positive numeric ID');
    const redirect = new URL(env.ETSY_REDIRECT_URI!);
    if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.search || redirect.hash) throw new Error('ETSY_REDIRECT_URI must be an HTTPS URL without query or fragment');
    etsy = { apiKey: env.ETSY_API_KEY!.trim(), sharedSecret: env.ETSY_SHARED_SECRET!.trim(), shopId: env.ETSY_SHOP_ID!, redirectUri: env.ETSY_REDIRECT_URI!, tokenFile: resolve(env.ETSY_TOKEN_FILE ?? '.private/etsy-tokens.json') };
  }
  return { host, port, allowedHosts, allowedOrigins, etsy };
}
