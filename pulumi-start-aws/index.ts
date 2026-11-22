import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';

const stack = pulumi.getStack();
if (!['dev', 'prod'].includes(stack)) throw new Error('Use a stack dev ou prod.');
const config = new pulumi.Config();
const accountId = config.require('accountId');
const tableName = config.require('tableName');
const functionName = config.require('functionName');
const roleArn = config.require('roleArn');
const hostingEnabled = config.getBoolean('hostingEnabled') === true;
const googleClientId = stack === 'dev' ? config.get('googleClientId') : undefined;
const googleSecretArn = stack === 'dev' ? config.get('googleClientSecretArn') : undefined;
if (aws.config.region !== 'us-east-1') throw new Error('A região autorizada é us-east-1.');
if (tableName !== `autokeep-${stack}` || functionName !== `autokeep-api-${stack}`)
  throw new Error('Os recursos devem corresponder à stack selecionada.');
if (roleArn !== `arn:aws:iam::${accountId}:role/${functionName}`)
  throw new Error('Execution role diferente da identidade auditada.');

const provider = new aws.Provider('account', {
  region: 'us-east-1',
  allowedAccountIds: [accountId],
});

function staticFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const file = resolve(directory, entry);
    return statSync(file).isDirectory() ? staticFiles(file) : [file];
  });
}

function mimeType(file: string): string {
  return (
    (
      {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.ico': 'image/x-icon',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain; charset=utf-8',
        '.webmanifest': 'application/manifest+json',
        '.webp': 'image/webp',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
      } as Record<string, string>
    )[extname(file).toLowerCase()] || 'application/octet-stream'
  );
}

// Adoption only: import the existing IDs. Review a saved plan before applying.
const table = new aws.dynamodb.Table(
  'database',
  {
    name: tableName,
    billingMode: 'PROVISIONED',
    tableClass: 'STANDARD',
    hashKey: 'pk',
    rangeKey: 'sk',
    attributes: [
      { name: 'pk', type: 'S' },
      { name: 'sk', type: 'S' },
    ],
    readCapacity: 5,
    writeCapacity: 5,
    ttl: { attributeName: 'ttl', enabled: true },
    pointInTimeRecovery: { enabled: false },
    streamEnabled: false,
    deletionProtectionEnabled: false,
  },
  {
    provider,
    import: tableName,
    protect: true,
    retainOnDelete: true,
    ignoreChanges: ['tags', 'tagsAll'],
  },
);

const lambdaCodePath = resolve(process.cwd(), '../dist/autokeep-lambda.zip');
const currentLambda = hostingEnabled
  ? aws.lambda.getFunctionOutput({ functionName }, { provider })
  : undefined;
const appOrigin = hostingEnabled ? config.require('appOrigin') : undefined;
if (googleClientId || googleSecretArn) {
  const expectedArnPrefix = `arn:aws:secretsmanager:us-east-1:${accountId}:secret:`;
  if (!hostingEnabled || !googleClientId || !googleSecretArn?.startsWith(expectedArnPrefix))
    throw new Error('Configure hostingEnabled, googleClientId e o ARN do segredo da conta dev.');
  const publicUrl = new URL(appOrigin!);
  if (publicUrl.origin !== appOrigin || publicUrl.protocol !== 'https:')
    throw new Error('appOrigin do OAuth deve ser uma origem HTTPS sem caminho ou barra final.');
}
const preservedEnvironment = currentLambda?.environment.apply((environment) => ({
  ...environment.variables,
  DYNAMODB_TABLE: tableName,
  APP_ORIGIN: appOrigin!,
  ...(stack === 'dev'
    ? {
        GOOGLE_CLIENT_ID: googleClientId ?? '',
        GOOGLE_CLIENT_SECRET_ARN: googleSecretArn ?? '',
      }
    : {}),
}));

if (hostingEnabled && !existsSync(lambdaCodePath)) {
  throw new Error('Execute npm run build:lambda antes de ativar hostingEnabled.');
}

const api = new aws.lambda.Function(
  'api',
  {
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
    ...(hostingEnabled
      ? {
          code: new pulumi.asset.FileArchive(lambdaCodePath),
          sourceCodeHash: createHash('sha256')
            .update(readFileSync(lambdaCodePath))
            .digest('base64'),
          environment: { variables: pulumi.secret(preservedEnvironment!) },
        }
      : {}),
  },
  {
    provider,
    import: functionName,
    protect: true,
    retainOnDelete: true,
    additionalSecretOutputs: ['environment'],
    // Adopting an existing function must preserve its code and environment.
    ignoreChanges: hostingEnabled
      ? ['tags', 'tagsAll', 'vpcConfig', 'tracingConfig']
      : [
          'code',
          'sourceCodeHash',
          's3Bucket',
          's3Key',
          's3ObjectVersion',
          'imageUri',
          'environment',
          'tags',
          'tagsAll',
          'vpcConfig',
          'tracingConfig',
        ],
  },
);

if (googleSecretArn) {
  new aws.iam.RolePolicy(
    'google-oauth-secret-read',
    {
      role: functionName,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 'secretsmanager:GetSecretValue',
            Resource: googleSecretArn,
          },
        ],
      }),
    },
    { provider },
  );
}

let dnsZone: aws.route53.Zone | undefined;
if (stack === 'prod') {
  dnsZone = new aws.route53.Zone(
    'dns',
    {
      name: 'autokeep.negoci.online',
      comment: 'AutoKeep public DNS zone',
    },
    {
      provider,
      import: config.require('hostedZoneId'),
      protect: true,
      retainOnDelete: true,
    },
  );
}

export const databaseName = table.name;
export const databaseArn = table.arn;
export const apiName = api.name;
export const apiArn = api.arn;
export const region = 'us-east-1';
export const dnsZoneId = dnsZone?.zoneId;
export const dnsNameServers = dnsZone?.nameServers;

let hostingBucketName: pulumi.Output<string> | undefined;
let hostingApiUrl: pulumi.Output<string> | undefined;
let hostingCloudFrontUrl: pulumi.Output<string> | undefined;
let hostingDistributionId: pulumi.Output<string> | undefined;

if (hostingEnabled) {
  const webPath = resolve(process.cwd(), '../dist/web');
  if (!existsSync(webPath))
    throw new Error('Execute npm run build antes de ativar hostingEnabled.');

  const bucketName = `autokeep-${stack}-web-${accountId}`;
  const bucket = new aws.s3.BucketV2(
    'web',
    {
      bucket: bucketName,
      forceDestroy: false,
    },
    { provider, protect: true, retainOnDelete: true },
  );
  new aws.s3.BucketPublicAccessBlock(
    'web-public-access',
    {
      bucket: bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    },
    { provider },
  );
  new aws.s3.BucketServerSideEncryptionConfigurationV2(
    'web-encryption',
    {
      bucket: bucket.id,
      rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: 'AES256' } }],
    },
    { provider },
  );
  const originAccess = new aws.cloudfront.OriginAccessControl(
    'web-origin-access',
    {
      name: `autokeep-${stack}-web`,
      description: 'Private S3 access for AutoKeep CloudFront distribution',
      originAccessControlOriginType: 's3',
      signingBehavior: 'always',
      signingProtocol: 'sigv4',
    },
    { provider },
  );

  const websiteFiles = staticFiles(webPath);
  const websiteObjects = websiteFiles.map((file) => {
    const key = relative(webPath, file).split(sep).join('/');
    return new aws.s3.BucketObjectv2(
      `web-${createHash('sha1').update(key).digest('hex').slice(0, 12)}`,
      {
        bucket: bucket.id,
        key,
        source: new pulumi.asset.FileAsset(file),
        contentType: mimeType(file),
        cacheControl: key === 'index.html' ? 'no-cache' : 'public, max-age=3600',
      },
      { provider },
    );
  });

  const httpApi = new aws.apigatewayv2.Api(
    'http-api',
    {
      name: `autokeep-${stack}-http`,
      protocolType: 'HTTP',
      description: 'AutoKeep application API',
    },
    { provider, protect: true, retainOnDelete: true },
  );
  const integration = new aws.apigatewayv2.Integration(
    'lambda-integration',
    {
      apiId: httpApi.id,
      integrationType: 'AWS_PROXY',
      integrationUri: api.arn,
      payloadFormatVersion: '2.0',
      timeoutMilliseconds: 15000,
    },
    { provider, protect: true, retainOnDelete: true },
  );
  const route = new aws.apigatewayv2.Route(
    'all-api-routes',
    {
      apiId: httpApi.id,
      routeKey: '$default',
      target: pulumi.interpolate`integrations/${integration.id}`,
    },
    { provider, protect: true, retainOnDelete: true },
  );
  const stage = new aws.apigatewayv2.Stage(
    'default-stage',
    {
      apiId: httpApi.id,
      name: '$default',
      autoDeploy: true,
    },
    { provider, dependsOn: [route], protect: true, retainOnDelete: true },
  );
  new aws.lambda.Permission(
    'allow-http-api',
    {
      action: 'lambda:InvokeFunction',
      function: api.name,
      principal: 'apigateway.amazonaws.com',
      sourceArn: pulumi.interpolate`arn:aws:execute-api:us-east-1:${accountId}:${httpApi.id}/*/*`,
      statementId: 'AllowAutoKeepHttpApiInvoke',
    },
    { provider, protect: true, retainOnDelete: true },
  );

  const spaRewrite = new aws.cloudfront.Function(
    'spa-rewrite',
    {
      name: `autokeep-${stack}-spa-rewrite`,
      runtime: 'cloudfront-js-2.0',
      comment: 'Serve index.html for production client-side routes',
      publish: true,
      code: `function handler(event) {
  var request = event.request;
  if (!request.uri.includes('.')) request.uri = '/index.html';
  return request;
}`,
    },
    { provider, protect: true, retainOnDelete: true },
  );
  const customDomainEnabled = stack === 'prod' && config.getBoolean('customDomainEnabled') === true;
  let validatedCertificateArn: pulumi.Input<string> | undefined;
  if (customDomainEnabled) {
    if (!dnsZone) throw new Error('O domínio customizado só pode ser habilitado na stack prod.');
    const certificate = new aws.acm.Certificate(
      'web-certificate',
      {
        domainName: 'autokeep.negoci.online',
        validationMethod: 'DNS',
      },
      { provider, protect: true, retainOnDelete: true },
    );
    const validationRecord = new aws.route53.Record(
      'web-certificate-validation',
      {
        zoneId: dnsZone.zoneId,
        name: certificate.domainValidationOptions.apply((options) => options[0].resourceRecordName),
        type: certificate.domainValidationOptions.apply((options) => options[0].resourceRecordType),
        records: [
          certificate.domainValidationOptions.apply((options) => options[0].resourceRecordValue),
        ],
        ttl: 60,
      },
      { provider, protect: true, retainOnDelete: true },
    );
    const validation = new aws.acm.CertificateValidation(
      'web-certificate-validation',
      {
        certificateArn: certificate.arn,
        validationRecordFqdns: [validationRecord.fqdn],
      },
      { provider, protect: true, retainOnDelete: true },
    );
    validatedCertificateArn = validation.certificateArn;
  }

  const distribution = new aws.cloudfront.Distribution(
    'web-cdn',
    {
      enabled: true,
      comment: 'AutoKeep frontend and API',
      ...(customDomainEnabled ? { aliases: ['autokeep.negoci.online'] } : {}),
      defaultRootObject: 'index.html',
      priceClass: 'PriceClass_All',
      origins: [
        {
          domainName: bucket.bucketRegionalDomainName,
          originId: 'private-s3',
          originAccessControlId: originAccess.id,
          s3OriginConfig: { originAccessIdentity: '' },
        },
        {
          domainName: pulumi.interpolate`${httpApi.id}.execute-api.us-east-1.amazonaws.com`,
          originId: 'http-api',
          customOriginConfig: {
            httpPort: 80,
            httpsPort: 443,
            originProtocolPolicy: 'https-only',
            originSslProtocols: ['TLSv1.2'],
          },
        },
      ],
      defaultCacheBehavior: {
        targetOriginId: 'private-s3',
        viewerProtocolPolicy: 'redirect-to-https',
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        cachedMethods: ['GET', 'HEAD'],
        cachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        compress: true,
        functionAssociations: [
          {
            eventType: 'viewer-request',
            functionArn: spaRewrite.arn,
          },
        ],
      },
      orderedCacheBehaviors: [
        {
          pathPattern: '/api/*',
          targetOriginId: 'http-api',
          viewerProtocolPolicy: 'redirect-to-https',
          allowedMethods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
          cachedMethods: ['GET', 'HEAD'],
          cachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
          originRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
          compress: true,
        },
      ],
      restrictions: { geoRestriction: { restrictionType: 'none' } },
      viewerCertificate: customDomainEnabled
        ? {
            acmCertificateArn: validatedCertificateArn!,
            sslSupportMethod: 'sni-only',
            minimumProtocolVersion: 'TLSv1.2_2021',
          }
        : { cloudfrontDefaultCertificate: true },
    },
    {
      provider,
      dependsOn: [...websiteObjects, stage],
      protect: true,
      retainOnDelete: true,
    },
  );

  new aws.s3.BucketPolicy(
    'web-policy',
    {
      bucket: bucket.id,
      policy: pulumi.all([bucket.arn, distribution.arn]).apply(([bucketArn, distributionArn]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'AllowCloudFrontReadOnly',
              Effect: 'Allow',
              Principal: { Service: 'cloudfront.amazonaws.com' },
              Action: 's3:GetObject',
              Resource: `${bucketArn}/*`,
              Condition: { StringEquals: { 'AWS:SourceArn': distributionArn } },
            },
          ],
        }),
      ),
    },
    { provider, dependsOn: [distribution], protect: true, retainOnDelete: true },
  );

  if (customDomainEnabled) {
    new aws.route53.Record(
      'web-domain-alias',
      {
        zoneId: dnsZone!.zoneId,
        name: 'autokeep.negoci.online',
        type: 'A',
        aliases: [
          {
            name: distribution.domainName,
            zoneId: distribution.hostedZoneId,
            evaluateTargetHealth: false,
          },
        ],
      },
      { provider, protect: true, retainOnDelete: true },
    );
    new aws.route53.Record(
      'web-domain-alias-ipv6',
      {
        zoneId: dnsZone!.zoneId,
        name: 'autokeep.negoci.online',
        type: 'AAAA',
        aliases: [
          {
            name: distribution.domainName,
            zoneId: distribution.hostedZoneId,
            evaluateTargetHealth: false,
          },
        ],
      },
      { provider, protect: true, retainOnDelete: true },
    );
  }

  hostingBucketName = bucket.bucket;
  hostingApiUrl = httpApi.apiEndpoint;
  hostingCloudFrontUrl = pulumi.interpolate`https://${distribution.domainName}`;
  hostingDistributionId = distribution.id;
}

export const staticBucketName = hostingBucketName;
export const apiGatewayUrl = hostingApiUrl;
export const cloudFrontUrl = hostingCloudFrontUrl;
export const cloudFrontDistributionId = hostingDistributionId;
export const googleCallbackUrl = googleClientId
  ? new URL('/api/auth/google/callback', appOrigin!).href
  : undefined;
