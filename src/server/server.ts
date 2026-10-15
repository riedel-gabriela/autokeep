import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { config } from './config.js';
import { pool, migrate } from './db.js';
import { createApp } from './app.js';
import { seed } from './seed.js';
import { evaluateMaintenance } from './worker.js';

async function main() {
  await migrate();
  await seed();
  const app = createApp();
  const server = createServer(app);
  const vite = await createViteServer({
    server: { middlewareMode: true, ws: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  server.listen(config.PORT, '0.0.0.0', () =>
    console.log('AutoKeep disponível em http://localhost:8080'),
  );
  let timer: ReturnType<typeof setTimeout>;
  let stopping = false;
  async function sweep() {
    try {
      await evaluateMaintenance();
    } catch {
      console.error(
        JSON.stringify({ event: 'maintenance_evaluation_failed', code: 'WORKER_FAILED' }),
      );
    }
    if (!stopping) timer = setTimeout(sweep, 15 * 60_000);
  }
  void sweep();
  async function shutdown() {
    stopping = true;
    clearTimeout(timer);
    server.close();
    await vite.close();
    await pool.end();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
main().catch(() => {
  console.error(
    JSON.stringify({
      event: 'startup_failed',
      code: 'STARTUP_FAILED',
      hint: 'Confira Docker, banco, migrações e variáveis de ambiente.',
    }),
  );
  process.exit(1);
});
