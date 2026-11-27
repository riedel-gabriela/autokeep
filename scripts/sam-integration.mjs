import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

// Fixed local endpoints prevent test fixtures from reaching an AWS account.
Object.assign(process.env, {
  AWS_ACCESS_KEY_ID: 'AUTOKEEPLOCAL',
  AWS_SECRET_ACCESS_KEY: 'local-development-only',
  AWS_REGION: 'us-east-1',
  DYNAMODB_TABLE: 'autokeep-sam',
  DYNAMODB_ENDPOINT: 'http://127.0.0.1:8000',
});
delete process.env.AWS_SESSION_TOKEN;
const { get, put } = await import('../src/server/dynamo.ts');
const base = 'http://127.0.0.1:3000/api';
const origin = 'http://localhost:3000';
async function request(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(120000),
    headers: {
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }),
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : undefined,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
const login = await request('/auth/dev-login', { method: 'POST' });
assert.equal(login.status, 200);
assert.ok(login.cookie);
assert.equal(login.data.memberships[0].kind, 'PERSONAL');
const cookie = login.cookie;
const orgId = login.data.memberships[0].organizationId;
const org = `/organizations/${orgId}`;
const otherId = randomUUID(),
  otherToken = randomBytes(32).toString('base64url');
await put(
  `USER#${otherId}`,
  'PROFILE',
  { id: otherId, name: 'Outra pessoa SAM', email: `${otherId}@example.com` },
  true,
);
await put(
  `SESSION#${createHash('sha256').update(otherToken).digest('hex')}`,
  'SESSION',
  { userId: otherId, expiresAt: Date.now() + 600000, ttl: Math.floor(Date.now() / 1000) + 600 },
  true,
);
const otherCookie = `autokeep_session=${otherToken}`;
assert.equal((await request(`${org}/dashboard`, { cookie: otherCookie })).status, 403);
assert.equal(
  (
    await request('/organizations', {
      method: 'POST',
      body: { kind: 'FLEET', companyName: 'Removido' },
      cookie,
    })
  ).status,
  404,
);
const created = await request(`${org}/vehicles`, {
  method: 'POST',
  cookie,
  body: {
    name: 'Veículo teste SAM',
    plate: 'SAM1D23',
    year: 2020,
    oilType: 'MINERAL',
    trackingMode: 'MANUAL',
    currentOdometer: 15000,
    lastOilChangeKm: 10000,
    lastOilChangeDate: '2025-01-01T00:00:00Z',
  },
});
assert.equal(created.status, 201);
const carId = created.data.id,
  car = `${org}/vehicles/${carId}`;
try {
  assert.equal((await request(car, { cookie })).status, 200);
  assert.equal((await request(car, { cookie: otherCookie })).status, 403);
  assert.equal(
    (
      await request(`${car}/odometer`, {
        method: 'POST',
        cookie,
        body: { odometer: 14999, source: 'MANUAL', measuredAt: new Date().toISOString() },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`${car}/odometer`, {
        method: 'POST',
        cookie,
        body: { odometer: 15100, source: 'MANUAL', measuredAt: new Date().toISOString() },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(`${car}/oil-changes`, {
        method: 'POST',
        cookie,
        body: { odometer: 15100, oilType: 'SYNTHETIC', changedAt: new Date().toISOString() },
      })
    ).status,
    201,
  );
  const history = await request(`${car}/history`, { cookie });
  assert.equal(history.status, 200);
  assert.ok(history.data.oilChanges.some((oil) => oil.odometer === 15100));
  assert.equal((await request(`${org}/audit`, { cookie })).status, 200);
  assert.equal((await request(`${org}/notifications`, { cookie })).status, 200);
  assert.equal(
    (await request(`${org}/notifications/read`, { method: 'POST', cookie })).status,
    200,
  );
  assert.equal((await request(`${org}/members`, { cookie })).status, 404);
  assert.equal(
    (await request(`${car}/driver`, { method: 'PUT', cookie, body: { driverId: null } })).status,
    404,
  );
  assert.ok(await get(`ORG#${orgId}`, `CAR#${carId}`));
} finally {
  assert.equal((await request(car, { method: 'DELETE', cookie })).status, 204);
}
assert.equal((await request(car, { cookie })).status, 404);
assert.equal((await request('/auth/logout', { method: 'POST', cookie })).status, 204);
assert.equal((await request('/session', { cookie })).status, 401);
console.log(
  'SAM: login dev, garagem pessoal, isolamento, veículo, km, óleo, histórico, notificações, arquivamento e logout aprovados.',
);
