import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from './config.js';
import { EtsyApiClient } from './clients/etsy.js';
import { createMcpServer } from './mcp.js';

export function createHttpServer(config: Config) {
  const etsy = config.etsy ? new EtsyApiClient(config.etsy) : undefined;
  const http = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    let hostname: string;
    try { hostname = new URL(`http://${req.headers.host ?? ''}`).hostname; }
    catch { res.writeHead(400).end('Invalid Host'); return; }
    if (!config.allowedHosts.includes(hostname)) { res.writeHead(403).end('Host not allowed'); return; }
    const origin = req.headers.origin;
    if (origin !== undefined && !config.allowedOrigins.includes(origin)) {
      res.writeHead(403).end('Origin not allowed'); return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id,MCP-Protocol-Version');
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (path !== '/mcp') { res.writeHead(404).end('Not found'); return; }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,MCP-Protocol-Version,Mcp-Session-Id,Authorization');
      res.writeHead(204).end(); return;
    }
    // This starter has no session termination or standalone SSE stream.
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST,OPTIONS'); res.writeHead(405).end(); return;
    }
    const server = createMcpServer(etsy);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once('close', () => {
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      console.error('MCP request failed'); // Never log request bodies or credentials.
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null
      }));
      else if (!res.writableEnded) res.end();
    }
  });
  http.requestTimeout = 30_000;
  http.headersTimeout = 15_000;
  return http;
}
