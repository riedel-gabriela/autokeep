import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

const stack = pulumi.getStack();
if (!['dev', 'prod'].includes(stack)) throw new Error('Use a stack dev ou prod.');
const config = new pulumi.Config();
const accountId = config.require('accountId');
const tableName = config.require('tableName');
const functionName = config.require('functionName');
const roleArn = config.require('roleArn');
if (aws.config.region !== 'us-east-1') throw new Error('A região autorizada é us-east-1.');
if (tableName !== `autokeep-${stack}` || functionName !== `autokeep-api-${stack}`)
  throw new Error('Os recursos devem corresponder à stack selecionada.');
if (roleArn !== `arn:aws:iam::${accountId}:role/${functionName}`)
  throw new Error('Execution role diferente da identidade auditada.');

const provider = new aws.Provider('account', {
  region: 'us-east-1',
  allowedAccountIds: [accountId],
});

// Adoption only: import the existing IDs. Review a saved plan before applying.
const table = new aws.dynamodb.Table('database', {
  name: tableName,
  billingMode: 'PROVISIONED',
  tableClass: 'STANDARD',
  hashKey: 'pk',
  rangeKey: 'sk',
  attributes: [{ name: 'pk', type: 'S' }, { name: 'sk', type: 'S' }],
  readCapacity: 5,
  writeCapacity: 5,
  ttl: { attributeName: 'ttl', enabled: true },
  pointInTimeRecovery: { enabled: false },
  streamEnabled: false,
  deletionProtectionEnabled: false,
}, {
  provider,
  import: tableName,
  protect: true,
  retainOnDelete: true,
  ignoreChanges: ['tags', 'tagsAll'],
});

const api = new aws.lambda.Function('api', {
  name: functionName,
  role: roleArn,
  packageType: 'Zip',
  runtime: 'nodejs24.x',
  handler: 'index.handler',
  memorySize: 256,
  timeout: 15,
  architectures: ['x86_64'],
  ephemeralStorage: { size: 512 },
  loggingConfig: { logFormat: 'Text', logGroup: `/aws/lambda/${functionName}` },
}, {
  provider,
  import: functionName,
  protect: true,
  retainOnDelete: true,
  additionalSecretOutputs: ['environment'],
  // Do not deploy code, remove existing secrets or change access during adoption.
  ignoreChanges: ['code', 'sourceCodeHash', 's3Bucket', 's3Key', 's3ObjectVersion',
    'imageUri', 'environment', 'tags', 'tagsAll', 'vpcConfig', 'tracingConfig'],
});
export const databaseName = table.name;
export const databaseArn = table.arn;
export const apiName = api.name;
export const apiArn = api.arn;
export const region = 'us-east-1';
