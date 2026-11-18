import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pulumi from '@pulumi/pulumi';

const resources: pulumi.runtime.MockResourceArgs[] = [];
pulumi.runtime.setMocks({
  newResource: args => {
    resources.push(args);
    return { id: args.id || `${args.name}-id`, state: {
      ...args.inputs,
      ...(args.type === 'aws:dynamodb/table:Table' ? { name: 'autokeep-dev', arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/autokeep-dev' } : {}),
      ...(args.type === 'aws:route53/zone:Zone' ? { name: 'autokeep.example', vpcs: [], nameServers: ['ns.example'] } : {}),
    } };
  },
  call: args => args.inputs,
}, 'autokeep', 'dev', false);
pulumi.runtime.setAllConfig({
  'autokeep:accountId': '123456789012',
  'autokeep:domainName': 'dev.autokeep.example',
  'autokeep:hostedZoneId': 'ZEXISTING',
});

test('dev apenas referencia tabela/zona existentes e não inventa destino de hospedagem', async () => {
  const program = await import('../index');
  await new Promise<void>(resolve => {
    pulumi.all([program.dynamodbTableName, program.hostedZoneId]).apply(() => resolve());
  });
  const table = resources.find(r => r.type === 'aws:dynamodb/table:Table');
  assert.equal(table?.id, 'autokeep-dev');
  assert.equal(table?.inputs.billingMode, undefined);
  const zone = resources.find(r => r.type === 'aws:route53/zone:Zone');
  assert.equal(zone?.id, 'ZEXISTING');
  assert.equal(resources.some(r => r.type === 'aws:route53/record:Record' && r.name === 'site'), false);
  assert.equal(program.dataManagement, 'reference');
  assert.match(program.dnsStatus, /Pendente/);
});
