import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { createApp } from './app.js';
import { ensureLocalTable } from './dynamo.js';

async function main() {
  await ensureLocalTable();
  const app = createApp();
  const server = createServer(app);
  const vite = await createViteServer({
    server: { middlewareMode: true, ws: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () =>
    console.log('AutoKeep disponível em http://localhost:8080'),
  );
  async function shutdown() {
    server.close();
    await vite.close();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
main().catch(() => {
  console.error(JSON.stringify({ event: 'startup_failed', code: 'STARTUP_FAILED' }));
  process.exitCode = 1;
});
