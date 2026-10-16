import { loadConfig } from './config.js';
import { createHttpServer } from './http.js';
const config = loadConfig();
const server = createHttpServer(config);
server.on('error', error => { console.error(`Server failed: ${error.message}`); process.exitCode = 1; });
server.listen(config.port, config.host, () => console.log(`Giggle Publisher listening on ${config.host}:${config.port}; MCP path /mcp`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10_000).unref();
  });
}
