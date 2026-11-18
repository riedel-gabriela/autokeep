import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { settings } from './settings';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { createDevelopmentApi } from './api';

const config = new pulumi.Config();
const environment = pulumi.getStack();
const options = settings({
  stack: environment,
  accountId: config.require('accountId'),
  domainName: config.get('domainName'),
  enableDns: config.getBoolean('enableDns'),
  hostedZoneId: config.get('hostedZoneId'),
  tableMode: config.get('tableMode'),
  tableName: config.get('tableName'),
  siteTarget: config.get('siteTarget'),
  importTableId: config.get('importTableId'),
});
const awsConfig = new pulumi.Config('aws');
const region = awsConfig.get('region') ?? 'us-east-1';
const tags = { Project: 'autokeep', Environment: environment, ManagedBy: 'Pulumi' };
// Credenciais vêm do perfil/ambiente; nunca são persistidas como configuração de stack.
const provider = new aws.Provider('aws', {
  region: region as aws.Region,
  profile: awsConfig.get('profile'),
  allowedAccountIds: [options.accountId],
});
const resourceOptions = { provider, protect: true };
const enableApi = config.getBoolean('enableApi') ?? false;
if (enableApi && environment !== 'dev') throw new Error('enableApi deve permanecer desativado em prod nesta etapa.');

const table = options.tableMode === 'reference'
  ? aws.dynamodb.Table.get('data', options.tableName, undefined, { provider })
  : new aws.dynamodb.Table('data', {
    name: options.tableName,
    billingMode: 'PROVISIONED',
    readCapacity: 5,
    writeCapacity: 5,
    tableClass: 'STANDARD',
    hashKey: 'pk',
    rangeKey: 'sk',
    attributes: [{ name: 'pk', type: 'S' }, { name: 'sk', type: 'S' }],
    deletionProtectionEnabled: environment === 'prod',
    // TTL e PITR existentes não são ligados/desligados durante adoção.
    // A API já verifica expiração de sessões e convites.
    tags,
  }, {
    ...resourceOptions,
    ...(options.tableMode === 'import' ? { import: options.importTableId, ignoreChanges: ['ttl', 'pointInTimeRecovery', 'serverSideEncryption'] } : {}),
  });

const zone = !options.enableDns ? undefined : options.hostedZoneId
  ? aws.route53.Zone.get('dns', options.hostedZoneId, undefined, { provider })
  : new aws.route53.Zone('dns', {
    name: options.domainName,
    comment: `AutoKeep ${environment}: delegar estes nameservers no domínio pai`,
    tags,
  }, resourceOptions);

// Verifica se a zona é pública e corresponde ao domínio/subdomínio autorizado.
const verifiedZoneId = zone ? pulumi.all([zone.id, zone.name, zone.vpcs]).apply(([id, name, vpcs]) => {
  const normalized = name.toLowerCase().replace(/\.$/, '');
  if (vpcs?.length || !(options.domainName === normalized || options.domainName?.endsWith(`.${normalized}`))) {
    throw new Error('A zona DNS deve ser pública e conter domainName. Confira hostedZoneId.');
  }
  return id;
}) : undefined;

if (verifiedZoneId) new aws.route53.Record('environment', {
  zoneId: verifiedZoneId,
  name: `_autokeep.${options.domainName}`,
  type: 'TXT',
  ttl: 300,
  records: [`"project=autokeep;environment=${environment}"`],
}, { provider });

// O domínio app é sempre um subdomínio; CNAME nunca é criado no apex da zona.
const siteRecord = verifiedZoneId && options.siteTarget && options.applicationDomain ? new aws.route53.Record('site', {
  zoneId: verifiedZoneId,
  name: options.applicationDomain,
  type: 'CNAME',
  ttl: 300,
  records: [options.siteTarget],
}, { provider }) : undefined;

const apiArtifact = path.resolve(__dirname, '../dist/lambda/index.cjs');
if (enableApi && !existsSync(apiArtifact)) throw new Error('Compile a API na raiz com npm run build:lambda antes do preview/up.');
const developmentApi = enableApi ? createDevelopmentApi({
  environment, accountId: options.accountId, region,
  tableArn: table.arn, tableName: table.name, provider,
  code: new pulumi.asset.AssetArchive({ 'index.cjs': new pulumi.asset.FileAsset(apiArtifact) }),
}) : undefined;

export const apiEndpoint = developmentApi?.endpoint ?? null;
export const apiFunctionName = developmentApi?.functionName ?? null;
export const apiRoleArn = developmentApi?.roleArn ?? null;
export const apiLogGroupName = developmentApi?.logGroupName ?? null;
export const stackEnvironment = environment;
export const awsAccountId = options.accountId;
export const awsRegion = region;
export const dynamodbTableName = table.name;
export const dynamodbTableArn = table.arn;
export const dataManagement = options.tableMode;
export const hostedZoneId = verifiedZoneId;
export const delegationNameServers = zone?.nameServers;
export const applicationDomain = options.applicationDomain;
export const siteDnsRecord = siteRecord?.fqdn;
export const dnsStatus = !options.enableDns ? 'DNS desativado nesta etapa; somente banco de dados.' : siteRecord
  ? 'Registro app definido. Validar delegação DNS e domínio/certificado no provedor de hospedagem.'
  : 'Pendente: configurar siteTarget com o destino informado pela hospedagem para criar o CNAME app.';
