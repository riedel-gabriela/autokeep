import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

test('production rejects development login even when development flags are mistakenly enabled', async (t) => {
  t.mock.method(DynamoDBClient.prototype, 'send', async () => {
    throw new Error('Production development endpoint must not access a user or database');
  });
  Object.assign(process.env, {
    NODE_ENV: 'production',
    DEV_LOGIN_ENABLED: 'true',
    AUTH_MODE: 'development',
    APP_ORIGIN: 'https://production.example',
    DYNAMODB_TABLE: 'autokeep-prod',
  });
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET_ARN;
  const { createApp } = await import('../src/server/app.js');
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const providers = await (await fetch(`${base}/auth/providers`)).json();
  assert.deepEqual(providers, { google: false, development: false, password: false });
  const response = await fetch(`${base}/auth/dev-login`, {
    method: 'POST',
    headers: { origin: 'https://production.example', 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 404);
});
