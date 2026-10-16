import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const url = new URL(process.env.MCP_URL ?? 'http://127.0.0.1:3000/mcp');
const client = new Client({ name: 'giggle-smoke', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ['health_check', 'hello']);
  for (const name of ['health_check', 'hello']) {
    const result = await client.callTool({ name, arguments: name === 'hello' ? { name: 'Giggle' } : {} });
    assert.ok(!result.isError);
    console.log(name, result.structuredContent);
  }
} finally { await client.close(); }
