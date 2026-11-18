import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { createDevelopmentApi } from '../api';

const accountId = '123456789012';
const tableArn = `arn:aws:dynamodb:us-east-1:${accountId}:table/autokeep-dev`;
const resources: pulumi.runtime.MockResourceArgs[] = [];
pulumi.runtime.setMocks({
  newResource: args => {
    resources.push(args);
    return { id: args.id || `${args.name}-id`, state: {
      ...args.inputs,
      arn: args.type === 'aws:cloudwatch/logGroup:LogGroup'
        ? `arn:aws:logs:us-east-1:${accountId}:log-group:${args.inputs.name}`
        : `arn:aws:lambda:us-east-1:${accountId}:function:${args.inputs.name ?? args.name}`,
      invokeArn: 'mock-invoke-arn',
      apiEndpoint: 'https://mock.execute-api.us-east-1.amazonaws.com',
      executionArn: `arn:aws:execute-api:us-east-1:${accountId}:mock`,
    } };
  },
  call: args => args.inputs,
}, 'autokeep', 'dev', false);

test('API dev limita IAM à tabela correta e usa role sem credenciais estáticas', async () => {
  const provider = new aws.Provider('test', { region: 'us-east-1' });
  const args = { environment: 'dev', accountId, region: 'us-east-1', tableArn,
    tableName: 'autokeep-dev', provider,
    code: new pulumi.asset.AssetArchive({ 'index.cjs': new pulumi.asset.StringAsset('exports.handler = async () => ({});') }) };
  assert.throws(() => createDevelopmentApi({ ...args, environment: 'prod' }), /somente em dev/);
  const api = createDevelopmentApi(args);
  await new Promise<void>(resolve => pulumi.all([api.endpoint, api.functionName, api.ready]).apply(() => resolve()));
  // A função depende da política, logo os inputs da política já foram resolvidos.
  const policy = JSON.parse(resources.find(r => r.type === 'aws:iam/rolePolicy:RolePolicy')!.inputs.policy);
  const db = policy.Statement.find((s: { Sid: string }) => s.Sid === 'DevelopmentTableOnly');
  assert.equal(db.Resource, tableArn);
  assert.deepEqual(db.Action, ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Query']);
  assert.ok(!JSON.stringify(policy).includes('autokeep-prod'));
  const fn = resources.find(r => r.type === 'aws:lambda/function:Function')!;
  assert.equal(fn.inputs.environment.variables.DYNAMODB_TABLE, 'autokeep-dev');
  assert.equal(fn.inputs.environment.variables.SEED_DEMO, 'false');
  assert.equal(fn.inputs.environment.variables.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(fn.inputs.runtime, 'nodejs24.x');
  const permission = resources.find(r => r.type === 'aws:lambda/permission:Permission')!;
  assert.equal(permission.inputs.principal, 'apigateway.amazonaws.com');
  assert.equal(permission.inputs.sourceAccount, accountId);
  assert.ok(permission.inputs.sourceArn.endsWith('/*/*/api/*'));
  const integration = resources.find(r => r.type === 'aws:apigatewayv2/integration:Integration')!;
  assert.equal(integration.inputs.payloadFormatVersion, '2.0');
});
