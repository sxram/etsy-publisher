import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export function registerHealthTools(server: McpServer): void {
  server.registerTool('health_check', {
    title: 'Giggle Publisher health check',
    description: 'Check whether Giggle Publisher responds. Does not contact Etsy or Gelato and changes no data.',
    inputSchema: {},
    outputSchema: { status: z.literal('ok'), service: z.string(), version: z.string() },
    annotations
  }, async () => {
    const result = { status: 'ok' as const, service: 'Giggle Publisher', version: '0.1.0' };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('hello', {
    title: 'Say hello', description: 'Return a greeting for a name; no external requests or writes.',
    inputSchema: { name: z.string().trim().min(1).max(80).default('World') },
    outputSchema: { message: z.string() }, annotations
  }, async ({ name }) => {
    const result = { message: `Hello, ${name}! Greetings from Giggle Publisher.` };
    return { content: [{ type: 'text', text: result.message }], structuredContent: result };
  });
}
