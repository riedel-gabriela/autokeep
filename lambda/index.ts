import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createCloudApp } from '../src/server/cloud-app.js';

type FunctionUrlEvent = {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
};

const app = createCloudApp();
let server: Promise<Server> | undefined;

function startServer() {
  server ??= new Promise((resolve, reject) => {
    const listener = createServer(app);
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => resolve(listener));
  });
  return server;
}

export async function handler(event: FunctionUrlEvent) {
  const listener = await startServer();
  const port = (listener.address() as AddressInfo).port;
  const path = event.rawPath || '/';
  if (!path.startsWith('/api/')) {
    return {
      statusCode: 404,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'NOT_FOUND', message: 'Rota não encontrada.' }),
      isBase64Encoded: false,
    };
  }
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (!['host', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  }
  if (event.cookies?.length) headers.set('cookie', event.cookies.join('; '));
  const method = event.requestContext.http.method;
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body
    : undefined;
  const response = await fetch(`http://127.0.0.1:${port}${path}${query}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    redirect: 'manual',
  });
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie' && key !== 'content-length' && key !== 'transfer-encoding') {
      responseHeaders[key] = value;
    }
  });
  return {
    statusCode: response.status,
    headers: responseHeaders,
    cookies: response.headers.getSetCookie(),
    body: Buffer.from(await response.arrayBuffer()).toString('base64'),
    isBase64Encoded: true,
  };
}
