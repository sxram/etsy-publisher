import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EtsyApiClient } from '../clients/etsy.js';
export function registerEtsyTools(server: McpServer, client: EtsyApiClient) {
  server.registerTool('list_etsy_drafts', {
    title: 'Etsy shop drafts', description: 'Read one page of drafts from the configured, verified owner shop. Does not publish or modify listings. count is the Etsy API total; drafts excludes any non-draft results.',
    inputSchema: { limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(100000).default(0) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ limit, offset }) => {
    try {
      const result = await client.listDrafts(limit, offset);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Etsy drafts could not be loaded. Check configuration and shop authorization; run npm run etsy:connect if needed.' }] };
    }
  });
}
