import assert from 'node:assert/strict';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
process.env.DYNAMODB_ENDPOINT = 'http://127.0.0.1:8000';
process.env.DYNAMODB_TABLE = 'autokeep-test';
const {
  claimDelivery,
  get,
  put,
  query,
  remove,
  removeOwned,
  take,
  writeRegistration,
  ensureLocalTable,
} = await import('../src/server/dynamo.js');

const key = { pk: { S: 'USER#abc' }, sk: { S: 'PROFILE' } };
const conditional = Object.assign(new Error(), { name: 'ConditionalCheckFailedException' });

test('a tabela só pode ser inicializada localmente e tolera criação concorrente', async (t) => {
  const send = t.mock.method(DynamoDBClient.prototype, 'send', async (command) => {
    if (command.constructor.name === 'DescribeTableCommand')
      throw Object.assign(new Error(), { name: 'ResourceNotFoundException' });
    throw Object.assign(new Error(), { name: 'ResourceInUseException' });
  });
  process.env.NODE_ENV = 'production';
  await assert.rejects(ensureLocalTable(), /DYNAMODB_LOCAL_ENDPOINT_REQUIRED/);
  assert.equal(send.mock.callCount(), 0);
  process.env.NODE_ENV = 'test';
  await ensureLocalTable();
  assert.deepEqual(
    send.mock.calls.map(({ arguments: [command] }) => command.constructor.name),
    ['DescribeTableCommand', 'CreateTableCommand'],
  );
  assert.deepEqual(send.mock.calls[1].arguments[0].input.KeySchema, [
    { AttributeName: 'pk', KeyType: 'HASH' },
    { AttributeName: 'sk', KeyType: 'RANGE' },
  ]);
});

test('DynamoDB codifica tipos, omite undefined e decodifica leituras consistentes', async (t) => {
  const send = t.mock.method(DynamoDBClient.prototype, 'send', async () => ({}));
  const data = { text: 'Carro', km: 12.5, enabled: false, deleted: null };
  await put('USER#abc', 'PROFILE', { ...data, omitted: undefined }, true);
  const item = {
    ...key,
    text: { S: 'Carro' },
    km: { N: '12.5' },
    enabled: { BOOL: false },
    deleted: { NULL: true },
  };
  assert.deepEqual(send.mock.calls[0].arguments[0].input.Item, item);
  assert.equal(
    send.mock.calls[0].arguments[0].input.ConditionExpression,
    'attribute_not_exists(pk)',
  );
  send.mock.mockImplementation(async () => ({ Item: item }));
  assert.deepEqual(await get('USER#abc', 'PROFILE'), { pk: 'USER#abc', sk: 'PROFILE', ...data });
  assert.equal(send.mock.calls[1].arguments[0].input.ConsistentRead, true);
  send.mock.mockImplementation(async () => ({}));
  assert.equal(await get('USER#abc', 'PROFILE'), undefined);
  await remove('USER#abc', 'PROFILE');
  assert.deepEqual(send.mock.calls.at(-1)?.arguments[0].input.Key, key);
  send.mock.mockImplementation(async () => ({ Attributes: item }));
  assert.equal((await take('USER#abc', 'PROFILE'))?.text, 'Carro');
  assert.equal(send.mock.calls.at(-1)?.arguments[0].input.ReturnValues, 'ALL_OLD');
});

test('consulta segue o cursor e respeita o limite restante', async (t) => {
  const page = t.mock.method(DynamoDBClient.prototype, 'send', async () => ({
    Items: [key],
    LastEvaluatedKey: key,
  }));
  page.mock.mockImplementationOnce(async () => ({ Items: [], LastEvaluatedKey: key }), 1);
  assert.equal((await query('USER#abc', 'PROFILE', 2)).length, 2);
  assert.deepEqual(
    page.mock.calls.map(({ arguments: [command] }) => command.input.Limit),
    [2, 1, 1],
  );
  assert.deepEqual(page.mock.calls[1].arguments[0].input.ExclusiveStartKey, key);
  page.mock.mockImplementation(async () => ({}));
  assert.deepEqual(await query('USER#abc', 'PROFILE'), []);
});

test('escritas condicionais distinguem conflito de falha do DynamoDB', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const send = t.mock.method(DynamoDBClient.prototype, 'send', async () => ({}));
  await claimDelivery('PUSH#abc', 'NOTICE#1', 2001);
  assert.deepEqual(send.mock.calls[0].arguments[0].input.Item.ttl, { N: '3' });
  assert.deepEqual(send.mock.calls[0].arguments[0].input.ExpressionAttributeValues, {
    ':now': { N: '1000' },
  });
  await writeRegistration([
    { pk: 'USER#abc', sk: 'PROFILE', data: { name: 'Ana' } },
    { pk: 'INVITE#1', sk: 'INVITE', data: { acceptedAt: 'now' }, unacceptedInvite: true },
  ]);
  const [{ Put: profile }, { Put: invite }] = send.mock.calls[1].arguments[0].input.TransactItems;
  assert.equal(profile.ConditionExpression, 'attribute_not_exists(pk)');
  assert.match(invite.ConditionExpression, /attribute_not_exists\(acceptedAt\).*expiresAt > :now/);
  send.mock.mockImplementation(async () => {
    throw conditional;
  });
  await removeOwned('WEB_PUSH', 'SUB#abc', 'owner');
  assert.deepEqual(send.mock.calls[2].arguments[0].input.ExpressionAttributeValues, {
    ':userId': { S: 'owner' },
  });
  const unavailable = new Error('unavailable');
  send.mock.mockImplementation(async () => {
    throw unavailable;
  });
  await assert.rejects(removeOwned('WEB_PUSH', 'SUB#abc', 'owner'), unavailable);
  await assert.rejects(writeRegistration([]), unavailable);
  send.mock.mockImplementation(async () => {
    throw Object.assign(new Error(), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
  });
  await assert.rejects(writeRegistration([]), { status: 409, code: 'REGISTRATION_CONFLICT' });
});
