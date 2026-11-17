import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/server/app.js';

const app = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = url.searchParams.get('__route');
  if (!route || route.startsWith('/') || route.includes('..')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'NOT_FOUND', message: 'Rota não encontrada.' }));
    return;
  }
  url.searchParams.delete('__route');
  req.url = `/api/${route}${url.search}`;
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
