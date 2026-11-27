import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

test('production Google login blocks development access, state mismatch and replay', async (t) => {
  const issuer = 'https://accounts.google.com';
  const clientId = 'autokeep-test';
  const items = new Map();
  let linked = true;
  let registration: any[] = [];
  t.mock.method(DynamoDBClient.prototype, 'send', async (command) => {
    const key = command.input.Item ?? command.input.Key;
    const id = key && JSON.stringify([key.pk.S, key.sk.S]);
    switch (command.constructor.name) {
      case 'PutItemCommand':
        items.set(id, command.input.Item);
        return {};
      case 'GetItemCommand':
        if (linked && key.pk.S.startsWith('OIDC#')) return { Item: { userId: { S: 'driver' } } };
        if (key.pk.S === 'USER#driver') return { Item: { id: { S: 'driver' } } };
        return { Item: items.get(id) };
      case 'DeleteItemCommand': {
        const attributes = items.get(id);
        items.delete(id);
        return { Attributes: attributes };
      }
      case 'QueryCommand':
        return { Items: [] };
      case 'TransactWriteItemsCommand':
        registration = command.input.TransactItems.map(({ Put }: any) => Put.Item);
        for (const item of registration) items.set(JSON.stringify([item.pk.S, item.sk.S]), item);
        return {};
      default:
        throw new Error(`Unexpected command ${command.constructor.name}`);
    }
  });
  t.mock.method(SecretsManagerClient.prototype, 'send', async () => ({
    SecretString: JSON.stringify({ 'autokeep/google-oauth-client-secret': 'test-secret' }),
  }));

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  let nonce: string | null;
  let exchanges = 0;
  const googleSubject = 'google-personal';
  const browserFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, issuer);
    if (url.pathname === '/.well-known/openid-configuration')
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/keys`,
        response_types_supported: ['code'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
      });
    if (url.pathname === '/keys') return Response.json({ keys: [jwk] });
    assert.equal(url.pathname, '/token');
    assert.equal(new URLSearchParams(String(init?.body)).get('client_secret'), 'test-secret');
    exchanges++;
    const timestamp = Math.floor(Date.now() / 1000);
    const message = [
      encode({ alg: 'RS256', kid: 'test' }),
      encode({
        iss: issuer,
        aud: clientId,
        sub: googleSubject,
        email: 'user@example.com',
        email_verified: true,
        nonce,
        iat: timestamp,
        exp: timestamp + 300,
      }),
    ].join('.');
    const signature = sign('RSA-SHA256', Buffer.from(message), privateKey);
    return Response.json({
      access_token: 'test-access-token',
      token_type: 'Bearer',
      id_token: `${message}.${signature.toString('base64url')}`,
    });
  });

  process.env.NODE_ENV = 'production';
  process.env.DEV_LOGIN_ENABLED = 'true';
  process.env.APP_ORIGIN = 'https://autokeep.test';
  process.env.AUTH_MODE = 'google';
  process.env.GOOGLE_CLIENT_ID = clientId;
  process.env.GOOGLE_CLIENT_SECRET_ARN = 'test-arn';
  process.env.DYNAMODB_TABLE = 'autokeep-local';
  process.env.DYNAMODB_ENDPOINT = 'http://db:8000';
  process.env.DEMO_PASSWORD = 'local-demo-password-123';
  process.env.SEED_DEMO = 'true';
  const { createApp } = await import('../src/server/app.js');
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const providers = await browserFetch(`${endpoint}/auth/providers`);
  assert.deepEqual(await providers.json(), { google: true, development: false, password: false });
  const blockedDevelopment = await browserFetch(`${endpoint}/auth/dev-login`, {
    method: 'POST',
    headers: { origin: process.env.APP_ORIGIN, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(blockedDevelopment.status, 404);
  const start = async (body = {}) => {
    const started = await browserFetch(`${endpoint}/auth/google/start`, {
      method: 'POST',
      headers: { origin: process.env.APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return started;
  };
  const begin = async (body = {}) => {
    const started = await start(body);
    assert.equal(started.status, 200);
    const temporaryCookie = started.headers.getSetCookie()[0];
    assert.match(temporaryCookie, /SameSite=Lax/);
    const authorization = new URL((await started.json()).url);
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    nonce = authorization.searchParams.get('nonce');
    const state = authorization.searchParams.get('state');
    return (responseState = state) =>
      browserFetch(`${endpoint}/auth/google/callback?code=test&state=${responseState}`, {
        redirect: 'manual',
        headers: { cookie: temporaryCookie.split(';')[0] },
      });
  };
  const callback = await begin();
  const mismatch = await callback('wrong-state');
  assert.equal(mismatch.headers.get('location'), '/?googleError=OAUTH_STATE');
  assert.equal(exchanges, 0);
  const success = await callback();
  assert.equal(success.headers.get('location'), '/');
  const sessionCookie = success.headers
    .getSetCookie()
    .find((value) => value.startsWith('autokeep_session='));
  assert.match(sessionCookie ?? '', /HttpOnly; Secure; SameSite=Strict/);
  const session = await browserFetch(`${endpoint}/session`, {
    headers: { cookie: sessionCookie!.split(';')[0] },
  });
  assert.equal((await session.json()).user.id, 'driver');
  const replay = await callback();
  assert.equal(replay.headers.get('location'), '/?googleError=OAUTH_STATE');
  assert.equal(exchanges, 1);

  linked = false;
  const unlinked = await begin();
  assert.equal((await unlinked()).headers.get('location'), '/');
  const organizations = [...items.values()].filter(
    (item) => item.pk.S.startsWith('ORG#') && item.sk.S === 'PROFILE',
  );
  assert.ok(organizations.length > 0);
  assert.ok(organizations.every((item) => item.kind.S === 'PERSONAL'));
  assert.equal(registration.length, 3);
  for (const body of [
    { workspace: { kind: 'FLEET', name: 'Frota' } },
    { invitation: 'A'.repeat(43) },
    { credentials: { email: 'x@example.com', password: 'x' } },
  ]) {
    assert.equal((await start(body)).status, 400);
  }
});
