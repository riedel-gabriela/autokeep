import assert from 'node:assert/strict';

const origin = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com$/.test(origin)) {
  throw new Error('Informe a apiEndpoint dev retornada pelo Pulumi (HTTPS API Gateway us-east-1).');
}
const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(35_000) });
assert.equal(health.status, 200, 'Health deve acessar a tabela pela role Lambda.');
assert.deepEqual(await health.json(), { status: 'ok' });
const session = await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(35_000) });
assert.equal(session.status, 401);
assert.equal((await session.json()).code, 'UNAUTHENTICATED');
const rejected = await fetch(`${origin}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://invalid.example' },
  body: JSON.stringify({ email: 'probe@autokeep.invalid', password: 'invalid-probe-password' }),
  signal: AbortSignal.timeout(35_000),
});
assert.equal(rejected.status, 403);
assert.equal((await rejected.json()).code, 'INVALID_ORIGIN');
const invalidLogin = await fetch(`${origin}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin },
  body: JSON.stringify({ email: 'probe@autokeep.invalid', password: 'invalid-probe-password' }),
  signal: AbortSignal.timeout(35_000),
});
assert.equal(invalidLogin.status, 401);
assert.equal((await invalidLogin.json()).code, 'INVALID_CREDENTIALS');
console.log('API dev: health 200, sessão ausente 401, origem inválida 403 e login inválido 401. Nenhum dado de negócio criado.');
