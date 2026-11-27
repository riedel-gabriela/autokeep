import assert from 'node:assert/strict';
import { createECDH, createHash, randomBytes } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import https from 'node:https';
import { get as httpGet } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { generateVAPIDKeys } from 'web-push';

const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:18000';
const url = new URL(endpoint);
const origin = process.env.AUTOKEEP_TEST_ORIGIN || 'http://localhost:8080';
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('LOCAL_TEST_DATABASE_REQUIRED');
const vapid = generateVAPIDKeys();
Object.assign(process.env, {
  NODE_ENV: 'development',
  CODESPACES: origin.endsWith('.app.github.dev') ? 'true' : 'false',
  PORT: '8080',
  DEV_LOGIN_ENABLED: 'true',
  AUTH_MODE: 'development',
  DYNAMODB_ENDPOINT: endpoint,
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  DYNAMODB_TABLE: `autokeep-test-${Date.now()}`,
  APP_ORIGIN: origin,
  PUSH_PUBLIC_KEY: vapid.publicKey,
  PUSH_PRIVATE_KEY: vapid.privateKey,
  PUSH_SUBJECT: 'mailto:push@example.com',
});
delete process.env.AWS_SESSION_TOKEN;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET_ARN;
const { createApp, runMaintenancePush } = await import('../../src/server/app.js');
const { ensureLocalTable, put, get } = await import('../../src/server/dynamo.js');

test('personal garage: development login, ownership, vehicle lifecycle, notifications and legacy isolation', async (t) => {
  await ensureLocalTable();
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const app = createApp();
  app.use(vite.middlewares);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = (path: string, method = 'GET', body?: unknown, cookie = '') =>
    fetch(`${root}${path}`, {
      method,
      headers: { origin, 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const pageForHost = (host: string): Promise<number> =>
    new Promise((resolve, reject) => {
      httpGet(root.replace(/\/api$/, '/'), { headers: { host } }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode!));
      }).on('error', reject);
    });
  try {
    assert.equal(await pageForHost(new URL(origin).host), 200);
    assert.equal(await pageForHost('untrusted.example'), 403);
    assert.equal((await request('/session')).status, 401);
    for (const [requestOrigin, expectedStatus] of [
      ['https://localhost:8080', origin.endsWith('.app.github.dev') ? 200 : 403],
      ['https://untrusted.example', 403],
    ] as const) {
      const forwarded = await fetch(`${root}/auth/dev-login`, {
        method: 'POST',
        headers: { origin: requestOrigin, 'content-type': 'application/json' },
        body: '{}',
      });
      assert.equal(forwarded.status, expectedStatus);
    }
    const login = await request('/auth/dev-login', 'POST', {});
    assert.equal(login.status, 200);
    assert.equal(
      /; Secure(?:;|$)/i.test(login.headers.get('set-cookie')!),
      origin.startsWith('https:'),
    );
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const session = (await login.json()) as any;
    assert.equal(session.memberships.length, 1);
    assert.equal(session.memberships[0].kind, 'PERSONAL');
    const orgId = session.memberships[0].organizationId;
    const org = `/organizations/${orgId}`;
    const otherId = 'a0000000-0000-4000-8000-000000000099';
    const otherToken = randomBytes(32).toString('base64url');
    await put(`USER#${otherId}`, 'PROFILE', {
      id: otherId,
      name: 'Outra pessoa',
      email: 'other@example.com',
    });
    await put(`SESSION#${createHash('sha256').update(otherToken).digest('hex')}`, 'SESSION', {
      userId: otherId,
      expiresAt: Date.now() + 60000,
    });
    const otherCookie = `autokeep_session=${otherToken}`;
    assert.equal((await request(`${org}/dashboard`, 'GET', undefined, otherCookie)).status, 403);
    const legacyId = 'b0000000-0000-4000-8000-000000000099';
    await put(`ORG#${legacyId}`, 'PROFILE', { id: legacyId, name: 'Frota legada', kind: 'FLEET' });
    await put(`ORG#${legacyId}`, `MEMBER#${session.user.id}`, {
      userId: session.user.id,
      role: 'ADMIN',
    });
    await put(`USER#${session.user.id}`, `ORG#${legacyId}`, {
      organizationId: legacyId,
      role: 'ADMIN',
    });
    const refreshed = (await (await request('/session', 'GET', undefined, cookie)).json()) as any;
    assert.equal(refreshed.memberships.length, 1);
    assert.equal(
      (await request(`/organizations/${legacyId}/dashboard`, 'GET', undefined, cookie)).status,
      403,
    );
    assert.ok(await get(`ORG#${legacyId}`, 'PROFILE'));
    for (const path of ['/organizations', `${org}/invitations`, '/invitations/accept']) {
      assert.equal((await request(path, 'POST', {}, cookie)).status, 404);
    }
    const created = await request(
      `${org}/vehicles`,
      'POST',
      {
        name: 'Veículo de teste',
        plate: 'ABC1D23',
        year: 2020,
        oilType: 'MINERAL',
        trackingMode: 'MANUAL',
        currentOdometer: 15000,
        lastOilChangeKm: 10000,
        lastOilChangeDate: '2025-01-01T00:00:00Z',
      },
      cookie,
    );
    assert.equal(created.status, 201);
    const carId = ((await created.json()) as any).id;
    const car = `${org}/vehicles/${carId}`;
    assert.equal((await request(car, 'GET', undefined, cookie)).status, 200);
    assert.equal((await request(car, 'GET', undefined, otherCookie)).status, 403);
    assert.equal((await request(`${car}/driver`, 'PUT', { driverId: null }, cookie)).status, 404);
    assert.equal((await request(`${org}/members`, 'GET', undefined, cookie)).status, 404);
    const subscriptionEndpoint = 'https://fcm.googleapis.com/fcm/send/personal';
    const keys = {
      p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    };
    assert.equal(
      (
        await request(
          '/push/subscription',
          'POST',
          { endpoint: subscriptionEndpoint, keys },
          cookie,
        )
      ).status,
      204,
    );
    const sent: string[] = [];
    t.mock.method(https, 'request', (options, callback) => {
      assert.equal(options.hostname, 'fcm.googleapis.com');
      sent.push(options.path);
      const response = Object.assign(new EventEmitter(), { statusCode: 201, headers: {} });
      return Object.assign(new EventEmitter(), {
        write: () => {},
        end: () => {
          callback(response);
          response.emit('end');
        },
      });
    });
    await Promise.all([runMaintenancePush(), runMaintenancePush()]);
    assert.deepEqual(sent, ['/fcm/send/personal']);
    const notices = (await (
      await request(`${org}/notifications`, 'GET', undefined, cookie)
    ).json()) as any;
    assert.ok(notices.notifications.some((n: any) => n.vehicleId === carId));
    const repeated = (await (
      await request(`${org}/notifications`, 'GET', undefined, cookie)
    ).json()) as any;
    assert.equal(repeated.notifications.length, notices.notifications.length);
    assert.equal((await request(`${org}/notifications/read`, 'POST', {}, cookie)).status, 200);
    const read = (await (
      await request(`${org}/notifications`, 'GET', undefined, cookie)
    ).json()) as any;
    assert.ok(read.notifications.every((n: any) => n.readAt));
    assert.equal(
      (
        await request(
          `${car}/odometer`,
          'POST',
          { odometer: 14999, source: 'MANUAL', measuredAt: new Date().toISOString() },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `${car}/odometer`,
          'POST',
          { odometer: 15100, source: 'OBD2', measuredAt: new Date().toISOString() },
          cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `${car}/oil-changes`,
          'POST',
          { odometer: 15100, oilType: 'SYNTHETIC', changedAt: new Date().toISOString() },
          cookie,
        )
      ).status,
      201,
    );
    const history = (await (
      await request(`${car}/history`, 'GET', undefined, cookie)
    ).json()) as any;
    assert.ok(history.readings.some((r: any) => r.odometer === 15100 && r.source === 'OBD2'));
    assert.ok(
      history.oilChanges.some((o: any) => o.odometer === 15100 && o.oilType === 'SYNTHETIC'),
    );
    assert.equal((await request(car, 'DELETE', {}, otherCookie)).status, 403);
    assert.equal((await request(car, 'DELETE', {}, cookie)).status, 204);
    assert.equal((await request(car, 'GET', undefined, cookie)).status, 404);
    const audit = (await (await request(`${org}/audit`, 'GET', undefined, cookie)).json()) as any;
    assert.ok(audit.events.some((event: any) => event.action === 'VEHICLE_ARCHIVED'));
    assert.equal((await request('/health')).status, 200);
    assert.equal((await request('/push/config', 'GET', undefined, cookie)).status, 200);
    assert.equal(
      (await request('/push/subscription', 'DELETE', { endpoint: subscriptionEndpoint }, cookie))
        .status,
      204,
    );
    assert.equal((await request('/auth/logout', 'POST', {}, cookie)).status, 204);
    assert.equal((await request('/session', 'GET', undefined, cookie)).status, 401);
  } finally {
    await vite.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
