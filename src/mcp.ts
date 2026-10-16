import type { EtsyApiClient } from './clients/etsy.js';
import { registerEtsyTools } from './tools/etsy.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHealthTools } from './tools/health.js';

/** A fresh instance per HTTP request: no process-local sessions or user credentials. */
export function createMcpServer(etsy?: EtsyApiClient): McpServer {
  const server = new McpServer({ name: 'giggle-publisher', version: '0.1.0' }, {
    instructions: 'Giggle Publisher provides health tools and, when configured locally, read-only access to the authorized Etsy shop.'
  });
  registerHealthTools(server);
  if (etsy) registerEtsyTools(server, etsy);
  return server;
}
