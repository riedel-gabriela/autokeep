import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pulumi from '@pulumi/pulumi';

const resources: pulumi.runtime.MockResourceArgs[] = [];
pulumi.runtime.setMocks({
  newResource: args => {
    resources.push(args);
    return { id: args.id || `${args.name}-id`, state: { ...args.inputs, arn: 'mock-table-arn' } };
  },
  call: args => args.inputs,
}, 'autokeep', 'dev', false);
pulumi.runtime.setAllConfig({
  'autokeep:accountId': '123456789012',
  'autokeep:enableDns': 'false',
  'autokeep:tableMode': 'create',
});
test('modo somente banco dispensa domínio e não registra zona ou registros DNS', async () => {
  const program = await import('../index');
  await new Promise<void>(resolve => pulumi.all([program.dynamodbTableName, program.dynamodbTableArn]).apply(() => resolve()));
  assert.equal(resources.some(r => r.type.startsWith('aws:route53/')), false);
  assert.equal(resources.filter(r => r.type === 'aws:dynamodb/table:Table').length, 1);
  assert.equal(program.hostedZoneId, undefined);
  assert.match(program.dnsStatus, /desativado/);
});
