import { test } from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpServer } from '../src/http.js';
import { loadConfig } from '../src/config.js';

test('real HTTP MCP handshake, tools, validation, and HTTP boundaries', async () => {
  const server = createHttpServer(loadConfig({}));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(x => x.name).sort(), ['health_check', 'hello']);
    assert.ok(tools.every(x => x.annotations?.readOnlyHint));
    const health = await client.callTool({ name: 'health_check', arguments: {} });
    assert.equal(health.isError, undefined);
    assert.deepEqual(health.structuredContent, { status: 'ok', service: 'Giggle Publisher', version: '0.1.0' });
    const hello = await client.callTool({ name: 'hello', arguments: { name: 'Stefan' } });
    assert.deepEqual(hello.structuredContent, { message: 'Hello, Stefan! Greetings from Giggle Publisher.' });
    const invalid = await client.callTool({ name: 'hello', arguments: { name: '' } });
    assert.equal(invalid.isError, true);
    const unknown = await client.callTool({ name: 'create_gelato_product', arguments: {} });
    assert.equal(unknown.isError, true);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/mcp`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${base}/mcp`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(hostStatus, 403);
    const preflight = await fetch(`${base}/mcp`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:6274' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:6274');
    assert.equal((await fetch(`${base}/mcp`, { headers: { Accept: 'application/json, text/event-stream' } })).status, 405);
    assert.equal((await fetch(`${base}/mcp`, { method: 'DELETE', headers: { Accept: 'application/json, text/event-stream' } })).status, 405);
    assert.equal((await fetch(`${base}/mcp`, { method: 'PUT' })).status, 405);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{bad' })).status, 400);
  } finally {
    await client.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('invalid configuration fails before listening', () => {
  for (const env of [{ PORT: '0' }, { PORT: 'abc' }, { ALLOWED_HOSTS: '*' }, { ALLOWED_ORIGINS: 'https://chatgpt.com/path' }]) {
    assert.throws(() => loadConfig(env));
  }
});
