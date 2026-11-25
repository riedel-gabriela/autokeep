import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

test('local demo credentials are returned only for the seeded DynamoDB Local app', async (t) => {
  t.mock.method(DynamoDBClient.prototype, 'send', async (command) => {
    if (command.constructor.name === 'GetItemCommand') return {};
    return {};
  });
  Object.assign(process.env, {
    APP_ORIGIN: 'http://localhost:8080',
    AUTH_MODE: 'password',
    DEMO_PASSWORD: 'local-demo-password-123',
    DYNAMODB_ENDPOINT: 'http://db:8000',
    DYNAMODB_TABLE: 'autokeep-local',
    SEED_DEMO: 'true',
  });
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET_ARN;

  const { createApp } = await import('../src/server/app.js');
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  const [providers, credentials] = await Promise.all([
    fetch(`${endpoint}/auth/providers`),
    fetch(`${endpoint}/auth/demo-credentials`),
  ]);
  assert.deepEqual(await providers.json(), { google: false, password: true });
  assert.deepEqual(await credentials.json(), {
    email: 'ana@autokeep.local',
    password: process.env.DEMO_PASSWORD,
  });
});
