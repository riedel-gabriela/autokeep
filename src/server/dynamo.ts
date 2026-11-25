type Attribute = { S: string } | { N: string } | { BOOL: boolean } | { NULL: true };
type Item = Record<string, Attribute>;

import {
  CreateTableCommand,
  DeleteItemCommand,
  DescribeTableCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { AppError } from './errors.js';

const region = process.env.AWS_REGION || 'us-east-1';
const table = process.env.DYNAMODB_TABLE || 'autokeep-dev';
const localEndpoint = process.env.DYNAMODB_ENDPOINT;
const endpoint = localEndpoint || `https://dynamodb.${region}.amazonaws.com/`;
const client = new DynamoDBClient({
  region,
  endpoint,
  ...(localEndpoint
    ? {
        // DynamoDB Local accepts arbitrary credentials; cloud uses the AWS default provider chain.
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
        },
      }
    : {}),
});

function encode(data: Record<string, unknown>): Item {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        value === null
          ? { NULL: true }
          : typeof value === 'number'
            ? { N: String(value) }
            : typeof value === 'boolean'
              ? { BOOL: value }
              : { S: String(value) },
      ]),
  );
}

function decode(item?: Item): Record<string, any> | undefined {
  if (!item) return undefined;
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [
      key,
      'S' in value ? value.S : 'N' in value ? Number(value.N) : 'BOOL' in value ? value.BOOL : null,
    ]),
  );
}

async function request<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const input = { TableName: table, ...payload };
  let command;
  switch (action) {
    case 'GetItem':
      command = new GetItemCommand(input as ConstructorParameters<typeof GetItemCommand>[0]);
      break;
    case 'PutItem':
      command = new PutItemCommand(input as ConstructorParameters<typeof PutItemCommand>[0]);
      break;
    case 'DeleteItem':
      command = new DeleteItemCommand(input as ConstructorParameters<typeof DeleteItemCommand>[0]);
      break;
    case 'Query':
      command = new QueryCommand(input as ConstructorParameters<typeof QueryCommand>[0]);
      break;
    case 'DescribeTable':
      command = new DescribeTableCommand(
        input as ConstructorParameters<typeof DescribeTableCommand>[0],
      );
      break;
    case 'CreateTable':
      command = new CreateTableCommand(
        input as ConstructorParameters<typeof CreateTableCommand>[0],
      );
      break;
    default:
      throw new Error(`Unsupported DynamoDB operation: ${action}`);
  }
  return (await client.send(command as never)) as T;
}

export async function get(pk: string, sk: string) {
  const result = await request<{ Item?: Item }>('GetItem', {
    Key: encode({ pk, sk }),
    ConsistentRead: true,
  });
  return decode(result.Item);
}

export async function put(pk: string, sk: string, data: Record<string, unknown>, absent = false) {
  return request('PutItem', {
    Item: encode({ pk, sk, ...data }),
    ...(absent ? { ConditionExpression: 'attribute_not_exists(pk)' } : {}),
  });
}

export async function remove(pk: string, sk: string) {
  return request('DeleteItem', { Key: encode({ pk, sk }) });
}

export async function take(pk: string, sk: string) {
  const result = await request<{ Attributes?: Item }>('DeleteItem', {
    Key: encode({ pk, sk }),
    ReturnValues: 'ALL_OLD',
  });
  return decode(result.Attributes);
}

export async function claimDelivery(pk: string, sk: string, leaseUntil: number) {
  await request('PutItem', {
    Item: encode({ pk, sk, leaseUntil, ttl: Math.ceil(leaseUntil / 1000) }),
    ConditionExpression: 'attribute_not_exists(pk) OR leaseUntil < :now',
    ExpressionAttributeValues: { ':now': { N: String(Date.now()) } },
  });
}

export async function removeOwned(pk: string, sk: string, userId: string) {
  try {
    await request('DeleteItem', {
      Key: encode({ pk, sk }),
      ConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': { S: userId } },
    });
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
  }
}

type RegistrationItem = {
  pk: string;
  sk: string;
  data: Record<string, unknown>;
  unacceptedInvite?: boolean;
};

export async function writeRegistration(items: RegistrationItem[]) {
  try {
    await client.send(
      new TransactWriteItemsCommand({
        TransactItems: items.map(({ pk, sk, data, unacceptedInvite }) => ({
          Put: {
            TableName: table,
            Item: encode({ ...data, pk, sk }),
            ConditionExpression: unacceptedInvite
              ? 'attribute_exists(pk) AND attribute_not_exists(acceptedAt) AND expiresAt > :now'
              : 'attribute_not_exists(pk)',
            ExpressionAttributeValues: unacceptedInvite
              ? { ':now': { N: String(Date.now()) } }
              : undefined,
          },
        })),
      }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'TransactionCanceledException' &&
      (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons?.some(
        (reason) => reason.Code === 'ConditionalCheckFailed',
      )
    ) {
      throw new AppError(
        409,
        'REGISTRATION_CONFLICT',
        'A conta já existe ou o convite não está mais disponível.',
      );
    }
    throw error;
  }
}

export async function query(pk: string, prefix: string, limit?: number) {
  const items: Record<string, any>[] = [];
  let last: Item | undefined;
  do {
    const result = await request<{ Items?: Item[]; LastEvaluatedKey?: Item }>('Query', {
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': { S: pk }, ':sk': { S: prefix } },
      ConsistentRead: true,
      ScanIndexForward: false,
      Limit: limit ? Math.max(1, limit - items.length) : undefined,
      ExclusiveStartKey: last,
    });
    items.push(...(result.Items || []).map((item) => decode(item)!));
    last = result.LastEvaluatedKey;
  } while (last && (!limit || items.length < limit));
  return items;
}

export function isConditionalFailure(error: unknown) {
  return (error as { name?: string })?.name === 'ConditionalCheckFailedException';
}

// Only the local development server may create a table. Cloud always uses IaC.
export async function ensureLocalTable() {
  if (!process.env.DYNAMODB_ENDPOINT) throw new Error('DYNAMODB_LOCAL_ENDPOINT_REQUIRED');
  const url = new URL(endpoint);
  if (
    process.env.NODE_ENV === 'production' ||
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', 'db', 'host.docker.internal'].includes(url.hostname)
  ) {
    throw new Error('DYNAMODB_LOCAL_ENDPOINT_REQUIRED');
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      try {
        await request('DescribeTable', {});
      } catch (error) {
        if ((error as { name?: string }).name !== 'ResourceNotFoundException') throw error;
        try {
          await request('CreateTable', {
            AttributeDefinitions: [
              { AttributeName: 'pk', AttributeType: 'S' },
              { AttributeName: 'sk', AttributeType: 'S' },
            ],
            KeySchema: [
              { AttributeName: 'pk', KeyType: 'HASH' },
              { AttributeName: 'sk', KeyType: 'RANGE' },
            ],
            ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
          });
        } catch (createError) {
          if ((createError as { name?: string }).name !== 'ResourceInUseException')
            throw createError;
        }
      }
      return;
    } catch (error) {
      if (attempt === 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
