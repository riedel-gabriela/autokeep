import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { get as httpGet } from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { generateVAPIDKeys } from 'web-push';

// Tests refuse remote/cloud databases, even if the shell contains AWS credentials.
const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:18000';
const url = new URL(endpoint);
const origin = process.env.AUTOKEEP_TEST_ORIGIN || 'http://localhost:8080';
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('LOCAL_TEST_DATABASE_REQUIRED');
const vapid = generateVAPIDKeys();
Object.assign(process.env, {
  NODE_ENV: 'development',
  DYNAMODB_ENDPOINT: endpoint,
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  DYNAMODB_TABLE: `autokeep-test-${Date.now()}`,
  SEED_DEMO: 'true',
  DEMO_PASSWORD: 'local-integration-test-password',
  APP_ORIGIN: origin,
  PUSH_PUBLIC_KEY: vapid.publicKey,
  PUSH_PRIVATE_KEY: vapid.privateKey,
  PUSH_SUBJECT: 'mailto:push@example.com',
});
delete process.env.AWS_SESSION_TOKEN;
delete process.env.SMTP_HOST;
const { createApp, runMaintenancePush } = await import('../../src/server/app.js');
const { ensureLocalTable } = await import('../../src/server/dynamo.js');

test('DynamoDB Local: autenticação, isolamento, RBAC, convites e notificações', async (t) => {
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
  function pageForHost(host: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      httpGet(root.replace(/\/api$/, '/'), { headers: { host } }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode!, body }));
        response.on('error', reject);
      }).on('error', reject);
    });
  }
  async function request(path: string, method = 'GET', body?: unknown, cookie = '') {
    return fetch(`${root}${path}`, {
      method,
      headers: { origin, 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function login(email: string) {
    const response = await request('/auth/login', 'POST', {
      email,
      password: process.env.DEMO_PASSWORD,
    });
    assert.equal(response.status, 200);
    assert.equal(
      /; Secure(?:;|$)/i.test(response.headers.get('set-cookie')!),
      origin.startsWith('https:'),
    );
    return {
      cookie: response.headers.get('set-cookie')!.split(';')[0],
      session: (await response.json()) as any,
    };
  }
  try {
    const page = await pageForHost(new URL(origin).host);
    assert.equal(page.status, 200);
    assert.match(page.body, /AutoKeep/);
    assert.equal((await pageForHost('untrusted.example')).status, 403);
    assert.equal(
      (
        await fetch(`${root}/auth/login`, {
          method: 'POST',
          headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
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
    const sent: string[] = [];
    t.mock.method(https, 'request', (options, onResponse) => {
      assert.equal(options.hostname, 'fcm.googleapis.com');
      assert.equal(options.headers['Content-Encoding'], 'aes128gcm');
      sent.push(options.path);
      const response = Object.assign(new EventEmitter(), { statusCode: 201, headers: {} });
      return Object.assign(new EventEmitter(), {
        write: () => {},
        end: () => {
          onResponse(response);
          response.emit('end');
        },
      });
    });
    const keys = {
      p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    };
    for (const [name, session] of [
      ['admin', admin],
      ['driver', driver],
    ] as const) {
      const endpoint = `https://fcm.googleapis.com/fcm/send/${name}`;
      assert.equal(
        (await request('/push/subscription', 'POST', { endpoint, keys }, session.cookie)).status,
        204,
      );
    }
    await runMaintenancePush();
    sent.length = 0;
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
    await Promise.all([runMaintenancePush(), runMaintenancePush()]);
    assert.deepEqual(sent, ['/fcm/send/admin']);
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
    assert.ok(invitation.invitationUrl.startsWith(`${origin}/#invite=`));
    const token = invitation.invitationUrl.split('#invite=')[1];
    const registration = { token, name: 'Novo motorista', password: 'new-driver-test-password' };
    assert.equal((await request('/auth/register-invited', 'POST', registration)).status, 201);
    assert.equal((await request('/auth/register-invited', 'POST', registration)).status, 404);
    assert.equal((await request('/auth/logout', 'POST', {}, driver.cookie)).status, 204);
    assert.equal((await request('/session', 'GET', undefined, driver.cookie)).status, 401);
  } finally {
    await vite.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
