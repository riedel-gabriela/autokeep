import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pulumi from '@pulumi/pulumi';
import { settings } from '../settings';

const base = { stack: 'dev', accountId: '123456789012', domainName: 'dev.autokeep.example' };
test('configuração evita ambiente inválido, conta incorreta e adoção ambígua', () => {
  assert.throws(() => settings({ ...base, stack: 'main' }));
  assert.throws(() => settings({ ...base, accountId: '123' }));
  assert.throws(() => settings({ ...base, domainName: 'https://example.com' }));
  assert.throws(() => settings({ ...base, tableName: 'autokeep-prod' }));
  assert.throws(() => settings({ ...base, tableMode: 'import' }));
  assert.throws(() => settings({ ...base, siteTarget: 'app.dev.autokeep.example' }));
  assert.throws(() => settings({ ...base, domainName: 'prod.autokeep.example' }));
  assert.equal(settings({ ...base, tableMode: 'import', importTableId: 'autokeep-dev' }).tableMode, 'import');
  assert.equal(settings(base).tableMode, 'reference');
  assert.equal(settings({ ...base, domainName: undefined, enableDns: false }).applicationDomain, undefined);
  assert.throws(() => settings({ ...base, domainName: undefined }));
});

const resources: pulumi.runtime.MockResourceArgs[] = [];
pulumi.runtime.setMocks({
  newResource: args => {
    resources.push(args);
    return { id: args.id || `${args.name}-id`, state: {
      ...args.inputs,
      ...(args.type === 'aws:route53/record:Record' ? { fqdn: `${args.inputs.name}.` } : {}),
      ...(args.type === 'aws:route53/zone:Zone' ? { name: 'prod.autokeep.example', vpcs: [], nameServers: ['ns.example'] } : {}),
    } };
  },
  call: args => args.inputs,
}, 'autokeep', 'prod', false);
pulumi.runtime.setAllConfig({
  'autokeep:accountId': base.accountId,
  'autokeep:domainName': 'prod.autokeep.example',
  'autokeep:tableMode': 'create',
  'autokeep:siteTarget': 'target.hosting.example',
  'aws:region': 'us-east-1',
});

test('recursos usam pk/sk, proteção de produção e DNS sem CNAME no apex', async () => {
  const program = await import('../index');
  await new Promise<void>(resolve => {
    pulumi.all([program.dynamodbTableName, program.hostedZoneId, program.siteDnsRecord]).apply(() => resolve());
  });
  const table = resources.find(r => r.type === 'aws:dynamodb/table:Table');
  assert.ok(table);
  assert.equal(table.inputs.hashKey, 'pk');
  assert.equal(table.inputs.rangeKey, 'sk');
  assert.equal(table.inputs.deletionProtectionEnabled, true);
  assert.equal(table.inputs.readCapacity, 5);
  const provider = resources.find(r => r.type === 'pulumi:providers:aws');
  assert.deepEqual(JSON.parse(provider?.inputs.allowedAccountIds), [base.accountId]);
  const site = resources.find(r => r.type === 'aws:route53/record:Record' && r.name === 'site');
  assert.equal(site?.inputs.name, 'app.prod.autokeep.example');
  assert.equal(site?.inputs.type, 'CNAME');
});
