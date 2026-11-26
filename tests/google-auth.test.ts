import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

test('Google login blocks state mismatch and replay, and public signup creates only a new workspace', async (t) => {
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
    SecretString: 'test-secret',
  }));

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  let nonce: string | null;
  let exchanges = 0;
  let verified = true;
  let subject = 'google-driver';
  const browserFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input) => {
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
    exchanges++;
    const timestamp = Math.floor(Date.now() / 1000);
    const message = [
      encode({ alg: 'RS256', kid: 'test' }),
      encode({
        iss: issuer,
        aud: clientId,
        sub: subject,
        email: 'user@example.com',
        email_verified: verified,
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
  assert.deepEqual(await providers.json(), { google: true, password: false });
  const blockedPassword = await browserFetch(`${endpoint}/auth/login`, {
    method: 'POST',
    headers: { origin: process.env.APP_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@autokeep.local', password: process.env.DEMO_PASSWORD }),
  });
  assert.equal(blockedPassword.status, 403);
  const blockedPasswordRegistration = await browserFetch(`${endpoint}/auth/register-invited`, {
    method: 'POST',
    headers: { origin: process.env.APP_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({
      token: 'A'.repeat(43),
      name: 'Convidado',
      password: 'strong-password-123',
    }),
  });
  assert.equal(blockedPasswordRegistration.status, 403);
  const hiddenDemoCredentials = await browserFetch(`${endpoint}/auth/demo-credentials`);
  assert.equal(hiddenDemoCredentials.status, 404);
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
  assert.equal((await unlinked()).headers.get('location'), '/?googleError=GOOGLE_ACCOUNT_UNLINKED');
  assert.equal(registration.length, 0);
  const invalid = await start({ workspace: { kind: 'DRIVER', name: 'Frota de terceiros' } });
  assert.equal(invalid.status, 400);
  const signup = await begin({ workspace: { kind: 'FLEET', name: 'Minha frota' } });
  assert.equal((await signup()).headers.get('location'), '/');
  const organization = registration.find(
    (item) => item.pk.S.startsWith('ORG#') && item.sk.S === 'PROFILE',
  );
  assert.equal(organization?.kind.S, 'FLEET');
  assert.equal(organization?.name.S, 'Minha frota');
  const memberships = registration.filter((item) => item.role);
  assert.equal(memberships.length, 2);
  assert.ok(memberships.every((item) => item.role.S === 'ADMIN'));
  assert.equal(memberships[0].pk.S, organization.pk.S);
  assert.equal(memberships[1].sk.S, organization.pk.S);

  subject = 'google-personal';
  const personal = await begin({ workspace: { kind: 'PERSONAL', name: 'Minha garagem' } });
  assert.equal((await personal()).headers.get('location'), '/');
  assert.ok(
    registration.some((item) => item.kind?.S === 'PERSONAL' && item.name.S === 'Minha garagem'),
  );
  assert.ok(registration.filter((item) => item.role).every((item) => item.role.S === 'ADMIN'));

  subject = 'google-invite';
  registration = [];
  verified = false;
  const unverified = await begin({ workspace: { kind: 'PERSONAL', name: 'Garagem' } });
  assert.equal((await unverified()).headers.get('location'), '/?googleError=OAUTH_EMAIL');
  assert.equal(registration.length, 0);
  verified = true;

  const invitation = 'A'.repeat(43);
  const invitePk = `INVITE#${createHash('sha256').update(invitation).digest('hex')}`;
  const inviteItem = {
    pk: { S: invitePk },
    sk: { S: 'INVITE' },
    organizationId: { S: 'existing-fleet' },
    expiresAt: { N: String(Date.now() + 60_000) },
    email: { S: 'other@example.com' },
  };
  const inviteKey = JSON.stringify([invitePk, 'INVITE']);
  items.set(inviteKey, inviteItem);
  const wrongEmail = await begin({ invitation });
  assert.equal(
    new URL((await wrongEmail()).headers.get('location')!, issuer).searchParams.get('googleError'),
    'INVITATION_INVALID',
  );
  assert.equal(registration.length, 0);
  items.set(inviteKey, { ...inviteItem, email: { S: 'user@example.com' } });
  const invited = await begin({ invitation });
  assert.equal((await invited()).headers.get('location'), '/');
  assert.ok(
    registration.some((item) => item.pk.S === 'ORG#existing-fleet' && item.role?.S === 'DRIVER'),
  );
  assert.ok(registration.some((item) => item.pk.S === invitePk && item.acceptedAt?.S));
});
