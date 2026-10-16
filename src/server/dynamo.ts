import { createHash, createHmac } from 'node:crypto';

type Attribute = { S: string } | { N: string } | { BOOL: boolean } | { NULL: true };
type Item = Record<string, Attribute>;

const region = process.env.AWS_REGION || 'us-east-1';
const table = process.env.DYNAMODB_TABLE || 'autokeep-dev';
const endpoint = process.env.DYNAMODB_ENDPOINT || `https://dynamodb.${region}.amazonaws.com/`;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest();

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
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKey || !secretKey) throw new Error('AWS_CREDENTIALS_MISSING');
  const body = JSON.stringify({ TableName: table, ...payload });
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = date.slice(0, 8);
  const host = new URL(endpoint).host;
  const target = `DynamoDB_20120810.${action}`;
  const token = process.env.AWS_SESSION_TOKEN;
  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.0',
    host,
    'x-amz-date': date,
    'x-amz-target': target,
  };
  if (token) headers['x-amz-security-token'] = token;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join('');
  const canonical = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha(body)}`;
  const scope = `${shortDate}/${region}/dynamodb/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha(canonical)}`;
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, shortDate), region), 'dynamodb'),
    'aws4_request',
  );
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, toSign).toString('hex')}`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(endpoint, { method: 'POST', headers, body });
    const result = (await response.json()) as T & { __type?: string; message?: string };
    if (response.ok) return result;
    const code = result.__type?.split('#').pop();
    if (
      attempt < 5 &&
      (response.status === 429 ||
        code === 'ProvisionedThroughputExceededException' ||
        code === 'ThrottlingException')
    ) {
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt + Math.random() * 100));
      continue;
    }
    const error = new Error(result.message || `DynamoDB ${response.status}`);
    (error as Error & { code?: string }).code = code;
    throw error;
  }
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
  return (error as { code?: string })?.code === 'ConditionalCheckFailedException';
}
