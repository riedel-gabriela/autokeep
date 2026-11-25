import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3000/api';
const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(120_000) });
assert.equal(health.status, 200, 'Health deve acessar o DynamoDB local.');
assert.deepEqual(await health.json(), { status: 'ok' });
const session = await fetch(`${base}/session`, { signal: AbortSignal.timeout(30_000) });
assert.equal(session.status, 401, 'Sessão ausente deve ser rejeitada.');
assert.equal((await session.json()).code, 'UNAUTHENTICATED');
const invalidOrigin = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://invalid.example' },
  body: JSON.stringify({ email: 'test@autokeep.local', password: 'not-a-real-password' }),
  signal: AbortSignal.timeout(30_000),
});
assert.equal(invalidOrigin.status, 403, 'Escrita de origem diferente deve ser rejeitada.');
assert.equal((await invalidOrigin.json()).code, 'INVALID_ORIGIN');
console.log('SAM local: health 200, sessão ausente 401 e origem inválida 403 confirmados.');
