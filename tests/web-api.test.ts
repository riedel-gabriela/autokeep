import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError, write } from '../src/web/api.js';

test('a API envia JSON e preserva a sessão de mesma origem', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  assert.deepEqual(await write('/vehicles', { name: 'Carro' }, 'PUT'), { ok: true });
  assert.deepEqual(fetch.mock.calls[0].arguments, [
    '/api/vehicles',
    {
      method: 'PUT',
      body: '{"name":"Carro"}',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    },
  ]);
});

test('a API diferencia respostas vazias, erros do servidor e indisponibilidade', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  assert.equal(await api('/session'), undefined);
  fetch.mock.mockImplementation(async () =>
    Response.json({ code: 'DENIED', message: 'Sem acesso.' }, { status: 403 }),
  );
  await assert.rejects(api('/session'), {
    name: 'Error',
    status: 403,
    code: 'DENIED',
    message: 'Sem acesso.',
  });
  fetch.mock.mockImplementation(async () => Response.json({}, { status: 500 }));
  await assert.rejects(api('/session'), { status: 500, code: 'REQUEST_FAILED' });
  fetch.mock.mockImplementation(
    async () => new Response('{', { status: 500, headers: { 'Content-Type': 'application/json' } }),
  );
  await assert.rejects(api('/session'), { status: 500, code: 'REQUEST_FAILED' });
  fetch.mock.mockImplementation(
    async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
  );
  await assert.rejects(api('/session'), { status: 200, code: 'API_UNAVAILABLE' });
  fetch.mock.mockImplementation(async () => {
    throw new TypeError('offline');
  });
  await assert.rejects(
    api('/session'),
    (error: ApiError) =>
      error instanceof ApiError && error.status === 0 && error.code === 'API_UNAVAILABLE',
  );
});
