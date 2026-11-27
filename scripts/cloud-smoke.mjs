import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [stack, address] = process.argv.slice(2);
assert.ok(['dev', 'prod'].includes(stack), 'Use dev ou prod.');
const origin = new URL(address).origin;
assert.ok(
  stack === 'prod'
    ? origin === 'https://autokeep.negoci.online'
    : /^https:\/\/[a-z0-9]+\.lambda-url\.us-east-1\.on\.aws$/.test(origin),
  'URL fora do ambiente esperado.',
);
const expectedAssets = [
  ...readFileSync('dist/web/index.html', 'utf8').matchAll(
    /(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g,
  ),
].map((m) => m[1]);
assert.ok(expectedAssets.length >= 2, 'Build sem referências JS/CSS.');
async function request(path, options) {
  return fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(20_000) });
}
// Wait for the published index to reference the exact tested build, including CDN propagation.
let published = false;
for (let attempt = 0; attempt < 18; attempt++) {
  try {
    const page = await request('/');
    const html = await page.text();
    if (page.ok && expectedAssets.every((asset) => html.includes(asset))) {
      published = true;
      break;
    }
  } catch {
    /* Retry transient propagation/network failures within a bounded window. */
  }
  if (attempt < 17) await new Promise((resolve) => setTimeout(resolve, 5000));
}
assert.ok(published, 'O frontend não corresponde ao pacote validado.');
for (const asset of expectedAssets) assert.equal((await request(asset)).status, 200);
const health = await request('/api/health');
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok' });
const providers = await request('/api/auth/providers');
assert.equal(providers.status, 200);
assert.deepEqual(await providers.json(), {
  google: stack === 'prod',
  development: stack === 'dev',
  password: false,
});
const headers = { origin, 'content-type': 'application/json' };
const login = await request('/api/auth/dev-login', { method: 'POST', headers, body: '{}' });
if (stack === 'prod') {
  assert.equal(login.status, 404, 'Produção deve bloquear o login dev.');
  assert.equal((await request('/api/session')).status, 401);
} else {
  assert.equal(login.status, 200);
  const session = await login.json();
  assert.equal(session.memberships[0].kind, 'PERSONAL');
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'Login sem cookie.');
  try {
    assert.equal((await request('/api/session', { headers: { cookie } })).status, 200);
    assert.equal(
      (
        await request(`/api/organizations/${session.memberships[0].organizationId}/dashboard`, {
          headers: { cookie },
        })
      ).status,
      200,
    );
  } finally {
    assert.equal(
      (
        await request('/api/auth/logout', {
          method: 'POST',
          headers: { ...headers, cookie },
          body: '{}',
        })
      ).status,
      204,
    );
  }
  assert.equal((await request('/api/session', { headers: { cookie } })).status, 401);
}
console.log(`${stack}: frontend do build validado, API e autenticação conferidos.`);
