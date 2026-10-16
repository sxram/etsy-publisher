import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../src/config.js';
import type { EtsyConfig } from '../src/clients/etsy.js';
import { beginAuthorization, callbackCode, EtsyApiClient } from '../src/clients/etsy.js';
let config: EtsyConfig | undefined;
try {
  config = loadConfig().etsy;
  if (!config) console.error('Etsy ist deaktiviert. Setze ETSY_ENABLED=true in der lokalen .env.');
} catch (error) {
  // Only configuration validation errors; never print provider responses or URLs.
  const message = error instanceof Error ? error.message : '';
  console.error(message === 'Invalid URL'
    ? 'Konfigurationsfehler: ETSY_REDIRECT_URI oder ALLOWED_ORIGINS enthält eine ungültige URL.'
    : `Konfigurationsfehler: ${message || 'Konfiguration konnte nicht geladen werden.'}`);
}
if (!config) {
  process.exitCode = 1;
} else {
const prompt = createInterface({ input: stdin, output: stdout });
try {
  const pending = beginAuthorization(config);
  console.log(`Open this URL in your browser and authorize your own shop:\n${pending.url}`);
  console.log('After redirect, copy the complete address from the browser. The callback page need not load. Complete within 10 minutes.');
  const callback = await prompt.question('Complete redirect URL: ');
  await new EtsyApiClient(config).connect(callbackCode(config, pending, callback.trim()), pending.verifier);
  console.log('Etsy shop ownership verified. Tokens saved privately.');
} catch { console.error('Etsy connection failed. Check credentials, exact registered HTTPS redirect URL, shop ID and consent. No tokens or provider errors are printed.'); process.exitCode = 1; }
finally { prompt.close(); }

}
