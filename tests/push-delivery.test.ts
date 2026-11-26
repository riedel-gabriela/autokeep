import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { generateVAPIDKeys } from 'web-push';
import type { Vehicle } from '../src/shared/domain.js';

test('worker deduplica, verifica a inscrição e remove apenas endpoints expirados', async (t) => {
  const keys = generateVAPIDKeys();
  process.env.PUSH_PUBLIC_KEY = keys.publicKey;
  process.env.PUSH_PRIVATE_KEY = keys.privateKey;
  process.env.PUSH_SUBJECT = 'mailto:test@example.com';
  const { deliverMaintenancePush } = await import('../src/server/push.js');
  const p256dh = createECDH('prime256v1').generateKeys().toString('base64url');
  const auth = randomBytes(16).toString('base64url');
  const subscriptions = ['active', 'claimed', 'revoked', 'expired', 'retry'].map((name) => ({
    pk: { S: 'WEB_PUSH' },
    sk: { S: `SUB#${name}` },
    userId: { S: 'owner' },
    endpoint: { S: `https://fcm.googleapis.com/fcm/send/${name}` },
    p256dh: { S: p256dh },
    auth: { S: auth },
  }));
  const saved: string[] = [];
  const removed: string[] = [];
  t.mock.method(DynamoDBClient.prototype, 'send', async (command) => {
    const input = command.input;
    switch (command.constructor.name) {
      case 'QueryCommand':
        return { Items: subscriptions };
      case 'GetItemCommand':
        return {
          Item: subscriptions.find(
            (item) => item.sk.S === input.Key.sk.S && !item.sk.S.endsWith('revoked'),
          ),
        };
      case 'PutItemCommand':
        if (input.ConditionExpression && input.Item.pk.S.includes('claimed'))
          throw Object.assign(new Error(), { name: 'ConditionalCheckFailedException' });
        if (!input.ConditionExpression) saved.push(input.Item.pk.S);
        return {};
      case 'DeleteItemCommand':
        assert.deepEqual(input.ExpressionAttributeValues, { ':userId': { S: 'owner' } });
        removed.push(input.Key.sk.S);
        return {};
      default:
        assert.fail(command.constructor.name);
    }
  });
  const requests: string[] = [];
  t.mock.method(https, 'request', (options, onResponse) => {
    const name = options.path.split('/').at(-1);
    requests.push(name);
    const statusCode = name === 'expired' ? 410 : name === 'retry' ? 503 : 201;
    const response = Object.assign(new EventEmitter(), { statusCode, headers: {} });
    return Object.assign(new EventEmitter(), {
      write() {},
      end() {
        onResponse(response);
        response.emit('end');
      },
    });
  });
  const visibleVehicles = t.mock.fn(async () => [
    {
      id: 'car',
      name: 'Carro',
      lastOilChangeDate: '2020-01-01',
      lastOilChangeKm: 10000,
      status: { level: 'DUE', distanceRemainingKm: 0, daysRemaining: 100 },
    } as Vehicle,
  ]);
  await deliverMaintenancePush(visibleVehicles);
  assert.deepEqual(
    visibleVehicles.mock.calls.map(({ arguments: args }) => args),
    [['owner']],
  );
  assert.deepEqual(requests, ['active', 'expired', 'retry']);
  assert.deepEqual(saved, ['PUSH#SUB#active#owner']);
  assert.deepEqual(removed, ['SUB#expired']);
});
