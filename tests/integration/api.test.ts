import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

// Tests refuse remote/cloud databases, even if the shell contains AWS credentials.
const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:18000';
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('LOCAL_TEST_DATABASE_REQUIRED');
Object.assign(process.env, {
  NODE_ENV: 'development',
  DYNAMODB_ENDPOINT: endpoint,
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  DYNAMODB_TABLE: `autokeep-test-${Date.now()}`,
  SEED_DEMO: 'true',
  DEMO_PASSWORD: 'local-integration-test-password',
  APP_ORIGIN: 'http://localhost:8080',
});
delete process.env.AWS_SESSION_TOKEN;
delete process.env.SMTP_HOST;
const { createApp } = await import('../../src/server/app.js');
const { ensureLocalTable } = await import('../../src/server/dynamo.js');

test('DynamoDB Local: autenticação, isolamento, RBAC, convites e notificações', async () => {
  await ensureLocalTable();
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function request(path: string, method = 'GET', body?: unknown, cookie = '') {
    return fetch(`${root}${path}`, {
      method,
      headers: { origin: 'http://localhost:8080', 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function login(email: string) {
    const response = await request('/auth/login', 'POST', {
      email,
      password: process.env.DEMO_PASSWORD,
    });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get('set-cookie')!.split(';')[0],
      session: (await response.json()) as any,
    };
  }
  try {
    assert.equal((await request('/session')).status, 401);
    const admin = await login('marina@autokeep.local');
    const driver = await login('lucas@autokeep.local');
    const personal = await login('ana@autokeep.local');
    const org = `/organizations/${admin.session.memberships[0].organizationId}`;
    assert.equal(
      (await request(`${org}/dashboard`, 'GET', undefined, personal.cookie)).status,
      403,
    );
    assert.equal((await request(`${org}/members`, 'GET', undefined, driver.cookie)).status, 403);
    const fleet = (await (
      await request(`${org}/dashboard`, 'GET', undefined, admin.cookie)
    ).json()) as any;
    assert.equal(fleet.vehicles.length, 1);
    const car = `${org}/vehicles/${fleet.vehicles[0].id}`;
    assert.equal((await request(`${car}/oil-changes`, 'POST', {}, driver.cookie)).status, 403);
    const created = await request(
      `${org}/vehicles`,
      'POST',
      {
        name: 'Veículo vencido',
        plate: 'ABC1D23',
        year: 2020,
        oilType: 'MINERAL',
        trackingMode: 'MANUAL',
        currentOdometer: 15000,
        lastOilChangeKm: 10000,
        lastOilChangeDate: '2025-01-01T00:00:00Z',
      },
      admin.cookie,
    );
    assert.equal(created.status, 201);
    const createdId = ((await created.json()) as any).id;
    assert.equal(
      (await request(`${org}/vehicles/${createdId}`, 'GET', undefined, driver.cookie)).status,
      404,
    );
    const notices = (await (
      await request(`${org}/notifications`, 'GET', undefined, admin.cookie)
    ).json()) as any;
    assert.ok(notices.notifications.some((n: any) => n.vehicleId === createdId));
    const repeated = (await (
      await request(`${org}/notifications`, 'GET', undefined, admin.cookie)
    ).json()) as any;
    assert.equal(repeated.notifications.length, notices.notifications.length);
    assert.equal(
      (await request(`${org}/notifications/read`, 'POST', {}, admin.cookie)).status,
      200,
    );
    const read = (await (
      await request(`${org}/notifications`, 'GET', undefined, admin.cookie)
    ).json()) as any;
    assert.ok(read.notifications.every((n: any) => n.readAt));
    const invited = await request(
      `${org}/invitations`,
      'POST',
      { email: 'new@autokeep.local' },
      admin.cookie,
    );
    assert.equal(invited.status, 201);
    const invitation = (await invited.json()) as any;
    const token = invitation.invitationUrl.split('#invite=')[1];
    const registration = { token, name: 'Novo motorista', password: 'new-driver-test-password' };
    assert.equal((await request('/auth/register-invited', 'POST', registration)).status, 201);
    assert.equal((await request('/auth/register-invited', 'POST', registration)).status, 404);
    assert.equal((await request('/auth/logout', 'POST', {}, driver.cookie)).status, 204);
    assert.equal((await request('/session', 'GET', undefined, driver.cookie)).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
