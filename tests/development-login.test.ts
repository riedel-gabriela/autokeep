import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

test('development login creates one personal session without credentials', async (t) => {
  const items = new Map<string, any>();
  t.mock.method(DynamoDBClient.prototype, 'send', async (command) => {
    const input = command.input;
    const key = input.Item ?? input.Key;
    const id = key && JSON.stringify([key.pk.S, key.sk.S]);
    if (command.constructor.name === 'PutItemCommand') items.set(id, input.Item);
    if (command.constructor.name === 'GetItemCommand') return { Item: items.get(id) };
    if (command.constructor.name === 'QueryCommand') return { Items: [] };
    return {};
  });
  Object.assign(process.env, {
    NODE_ENV: 'development',
    DEV_LOGIN_ENABLED: 'true',
    AUTH_MODE: 'development',
    APP_ORIGIN: 'http://localhost:8080',
    DYNAMODB_ENDPOINT: 'http://db:8000',
    DYNAMODB_TABLE: 'autokeep-local',
  });
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET_ARN;
  const { createApp } = await import('../src/server/app.js');
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  assert.deepEqual(await (await fetch(`${base}/auth/providers`)).json(), {
    google: false,
    development: true,
    password: false,
  });
  assert.equal(
    (
      await fetch(`${base}/auth/dev-login`, {
        method: 'POST',
        headers: { origin: 'https://foreign.example', 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
    403,
  );
  const response = await fetch(`${base}/auth/dev-login`, {
    method: 'POST',
    headers: { origin: 'http://localhost:8080', 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.user.name, 'Ana Souza');
  assert.equal(session.memberships.length, 1);
  assert.equal(session.memberships[0].kind, 'PERSONAL');
  assert.equal((await fetch(`${base}/auth/demo-credentials`)).status, 401);
});
