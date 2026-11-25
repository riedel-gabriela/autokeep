import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { hash } from 'bcryptjs';

// Endereços fixos: testes nunca utilizam perfil, endpoint ou tabela da nuvem.
Object.assign(process.env, {
  AWS_ACCESS_KEY_ID: 'AUTOKEEPLOCAL',
  AWS_SECRET_ACCESS_KEY: 'local-development-only',
  AWS_REGION: 'us-east-1',
  DYNAMODB_TABLE: 'autokeep-sam',
  DYNAMODB_ENDPOINT: 'http://127.0.0.1:8000',
});
delete process.env.AWS_SESSION_TOKEN;
const { get, put, query } = await import('../src/server/dynamo.ts');
const base = 'http://127.0.0.1:3000/api';
const origin = 'http://localhost:3000';
const run = randomUUID();
const password = randomBytes(24).toString('base64url');
const passwordHash = await hash(password, 12);
const fleet = randomUUID(),
  otherOrg = randomUUID();
const admin = { id: randomUUID(), name: 'Admin teste SAM', email: `admin-${run}@autokeep.local` };
const driver = {
  id: randomUUID(),
  name: 'Motorista teste SAM',
  email: `driver-${run}@autokeep.local`,
};
const outsider = {
  id: randomUUID(),
  name: 'Admin de outro espaço',
  email: `other-${run}@autokeep.local`,
};
for (const user of [admin, driver, outsider]) {
  await put(`USER#${user.id}`, 'PROFILE', { ...user, passwordHash }, true);
  await put(`EMAIL#${user.email}`, 'USER', { userId: user.id }, true);
}
await put(
  `ORG#${fleet}`,
  'PROFILE',
  { id: fleet, name: `Frota teste ${run}`, kind: 'FLEET' },
  true,
);
await put(
  `ORG#${otherOrg}`,
  'PROFILE',
  { id: otherOrg, name: `Outro espaço ${run}`, kind: 'FLEET' },
  true,
);
for (const [orgId, user, role] of [
  [fleet, admin, 'ADMIN'],
  [fleet, driver, 'DRIVER'],
  [otherOrg, outsider, 'ADMIN'],
]) {
  await put(`ORG#${orgId}`, `MEMBER#${user.id}`, { userId: user.id, role }, true);
  await put(`USER#${user.id}`, `ORG#${orgId}`, { organizationId: orgId, role }, true);
}

let passed = 0,
  failed = 0;
async function test(name, action) {
  try {
    await action();
    passed++;
    console.log(`OK: ${name}`);
  } catch (error) {
    failed++;
    console.error(`FALHOU: ${name}: ${error.message}`);
  }
}
async function request(path, { method = 'GET', cookie, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(120_000),
    headers: {
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(method !== 'GET' ? { origin, 'content-type': 'application/json' } : {}),
    },
    ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  return { status: response.status, data, cookie: response.headers.get('set-cookie') };
}
const status = (response, expected) =>
  assert.equal(
    response.status,
    expected,
    `HTTP esperado ${expected}, recebido ${response.status}; código ${response.data?.code ?? 'sem código'}`,
  );
async function login(user) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: { email: user.email, password },
  });
  status(result, 200);
  assert.equal(result.data.user.id, user.id);
  assert.match(result.cookie, /HttpOnly/i);
  assert.match(result.cookie, /SameSite=Strict/i);
  assert.match(result.cookie, /Max-Age=43200/i);
  return result.cookie.split(';')[0];
}

await test('Saúde e banco local disponíveis', async () => {
  const result = await request('/health');
  status(result, 200);
  assert.equal(result.data.status, 'ok');
});
await test('Sessão ausente e cookie forjado são rejeitados', async () => {
  status(await request('/session'), 401);
  status(await request('/session', { cookie: `autokeep_session=${'x'.repeat(43)}` }), 401);
});
await test('Senha incorreta não autentica', async () => {
  status(
    await request('/auth/login', {
      method: 'POST',
      body: { email: admin.email, password: 'incorreta' },
    }),
    401,
  );
});
let adminCookie, driverCookie, outsiderCookie;
await test('Login ADMIN e restauração da sessão', async () => {
  adminCookie = await login(admin);
  const result = await request('/session', { cookie: adminCookie });
  status(result, 200);
  assert.equal(result.data.memberships.find((m) => m.organizationId === fleet)?.role, 'ADMIN');
});
await test('Login DRIVER e isolamento das associações', async () => {
  driverCookie = await login(driver);
  outsiderCookie = await login(outsider);
  const result = await request('/session', { cookie: driverCookie });
  status(result, 200);
  assert.deepEqual(
    result.data.memberships.map((m) => m.organizationId),
    [fleet],
  );
  assert.equal(result.data.memberships[0].role, 'DRIVER');
});
if (!adminCookie || !driverCookie || !outsiderCookie)
  throw new Error('Logins básicos falharam; restante dos testes interrompido.');

const org = `/organizations/${fleet}`;
const vehicleInput = {
  name: 'Veículo integração SAM',
  plate: 'TST1A23',
  year: 2024,
  oilType: 'MINERAL',
  trackingMode: 'MANUAL',
  currentOdometer: 12000,
  lastOilChangeKm: 10000,
  lastOilChangeDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
};
let carId;
await test('ADMIN cadastra veículo e dados persistem', async () => {
  const result = await request(`${org}/vehicles`, {
    method: 'POST',
    cookie: adminCookie,
    body: vehicleInput,
  });
  status(result, 201);
  assert.ok(result.data.id);
  carId = result.data.id;
  const stored = await get(`ORG#${fleet}`, `CAR#${carId}`);
  assert.equal(stored.currentOdometer, 12000);
  assert.equal(stored.organizationId, fleet);
});
if (!carId) throw new Error('Cadastro básico falhou; restante dos testes interrompido.');
const car = `${org}/vehicles/${carId}`;
await test('ADMIN consulta detalhes e painel', async () => {
  const detail = await request(car, { cookie: adminCookie });
  status(detail, 200);
  assert.equal(detail.data.vehicle.plate, vehicleInput.plate);
  const dashboard = await request(`${org}/dashboard`, { cookie: adminCookie });
  status(dashboard, 200);
  assert.ok(dashboard.data.vehicles.some((v) => v.id === carId));
});
await test('DRIVER não pode cadastrar veículo', async () => {
  const before = (await query(`ORG#${fleet}`, 'CAR#')).length;
  status(
    await request(`${org}/vehicles`, {
      method: 'POST',
      cookie: driverCookie,
      body: { ...vehicleInput, plate: 'TST1A24' },
    }),
    403,
  );
  assert.equal((await query(`ORG#${fleet}`, 'CAR#')).length, before);
});
await test('Veículo não atribuído é invisível ao DRIVER', async () => {
  status(await request(car, { cookie: driverCookie }), 404);
  const result = await request(`${org}/dashboard`, { cookie: driverCookie });
  status(result, 200);
  assert.ok(!result.data.vehicles.some((v) => v.id === carId));
});
await test('Outra organização não consulta nem altera o veículo', async () => {
  status(await request(car, { cookie: outsiderCookie }), 403);
  status(await request(`/organizations/${otherOrg}/dashboard`, { cookie: driverCookie }), 403);
  status(
    await request(`${car}/odometer`, {
      method: 'POST',
      cookie: outsiderCookie,
      body: { odometer: 99999, measuredAt: new Date().toISOString(), source: 'MANUAL' },
    }),
    403,
  );
});
await test('ADMIN atribui motorista e DRIVER passa a consultar', async () => {
  status(
    await request(`${car}/driver`, {
      method: 'PUT',
      cookie: adminCookie,
      body: { driverId: driver.id },
    }),
    200,
  );
  const result = await request(car, { cookie: driverCookie });
  status(result, 200);
  assert.equal(result.data.vehicle.assignedDriverId, driver.id);
});
await test('DRIVER registra leitura e ADMIN consulta valor persistido', async () => {
  status(
    await request(`${car}/odometer`, {
      method: 'POST',
      cookie: driverCookie,
      body: { odometer: 12100, measuredAt: new Date().toISOString(), source: 'MANUAL' },
    }),
    201,
  );
  const result = await request(car, { cookie: adminCookie });
  status(result, 200);
  assert.equal(result.data.vehicle.currentOdometer, 12100);
  assert.equal((await get(`ORG#${fleet}`, `CAR#${carId}`)).currentOdometer, 12100);
});
await test('Leitura regressiva, futura ou fora de ordem é rejeitada sem alterar odômetro', async () => {
  status(
    await request(`${car}/odometer`, {
      method: 'POST',
      cookie: driverCookie,
      body: { odometer: 10000, measuredAt: new Date().toISOString(), source: 'MANUAL' },
    }),
    400,
  );
  status(
    await request(`${car}/odometer`, {
      method: 'POST',
      cookie: driverCookie,
      body: {
        odometer: 13000,
        measuredAt: new Date(Date.now() + 86_400_000).toISOString(),
        source: 'MANUAL',
      },
    }),
    400,
  );
  status(
    await request(`${car}/odometer`, {
      method: 'POST',
      cookie: driverCookie,
      body: {
        odometer: 12150,
        measuredAt: new Date(Date.now() - 86_400_000).toISOString(),
        source: 'MANUAL',
      },
    }),
    400,
  );
  assert.equal((await get(`ORG#${fleet}`, `CAR#${carId}`)).currentOdometer, 12100);
});
await test('DRIVER não troca óleo, arquiva, atribui, convida ou consulta gestão', async () => {
  for (const [path, method, body] of [
    [
      `${car}/oil-changes`,
      'POST',
      { odometer: 12100, changedAt: new Date().toISOString(), oilType: 'SYNTHETIC' },
    ],
    [car, 'DELETE', {}],
    [`${car}/driver`, 'PUT', { driverId: null }],
    [`${org}/invitations`, 'POST', { email: `invite-${run}@autokeep.local` }],
    [`${org}/members`, 'GET'],
    [`${org}/audit`, 'GET'],
    [`${org}/members/${admin.id}`, 'DELETE', {}],
  ])
    status(await request(path, { method, cookie: driverCookie, body }), 403);
});
await test('Troca futura ou com quilometragem incoerente não altera o ciclo', async () => {
  const before = (await query(`CAR#${carId}`, 'OIL#')).length;
  for (const body of [
    {
      odometer: 12100,
      changedAt: new Date(Date.now() + 86_400_000).toISOString(),
      oilType: 'SYNTHETIC',
    },
    { odometer: 11000, changedAt: new Date().toISOString(), oilType: 'SYNTHETIC' },
  ])
    status(await request(`${car}/oil-changes`, { method: 'POST', cookie: adminCookie, body }), 400);
  assert.equal((await query(`CAR#${carId}`, 'OIL#')).length, before);
  assert.equal((await get(`ORG#${fleet}`, `CAR#${carId}`)).lastOilChangeKm, 10000);
});
await test('ADMIN registra troca e histórico preserva leituras e ciclos', async () => {
  status(
    await request(`${car}/oil-changes`, {
      method: 'POST',
      cookie: adminCookie,
      body: { odometer: 12100, changedAt: new Date().toISOString(), oilType: 'SYNTHETIC' },
    }),
    201,
  );
  const detail = await request(car, { cookie: adminCookie });
  status(detail, 200);
  assert.equal(detail.data.vehicle.oilType, 'SYNTHETIC');
  assert.equal(detail.data.vehicle.lastOilChangeKm, 12100);
  const history = await request(`${car}/history`, { cookie: driverCookie });
  status(history, 200);
  assert.ok(history.data.readings.length >= 2);
  assert.equal(history.data.oilChanges.length, 2);
});
await test('Desatribuição revoga visibilidade sem apagar histórico', async () => {
  status(
    await request(`${car}/driver`, {
      method: 'PUT',
      cookie: adminCookie,
      body: { driverId: null },
    }),
    200,
  );
  status(await request(car, { cookie: driverCookie }), 404);
  assert.equal((await query(`CAR#${carId}`, 'OIL#')).length, 2);
});
await test('Sessão expirada é rejeitada', async () => {
  const token = driverCookie.slice('autokeep_session='.length);
  const pk = `SESSION#${createHash('sha256').update(token).digest('hex')}`;
  const session = await get(pk, 'SESSION');
  await put(pk, 'SESSION', { ...session, expiresAt: Date.now() - 1000 });
  const result = await request('/session', { cookie: driverCookie });
  status(result, 401);
  assert.equal(result.data.code, 'SESSION_EXPIRED');
});
await test('Logout revoga sessão mesmo reutilizando o cookie anterior', async () => {
  status(await request('/auth/logout', { method: 'POST', cookie: adminCookie }), 204);
  status(await request('/session', { cookie: adminCookie }), 401);
});

console.log(`Resultado: ${passed} cenários aprovados; ${failed} falharam.`);
process.exitCode = failed ? 1 : 0;
