import * as fs from "node:fs";
import * as path from "node:path";
import * as mime from "mime-types";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const stack = pulumi.getStack();
const project = pulumi.getProject();
const config = new pulumi.Config();
const senderEmail = config.require("senderEmail");
const isProduction = stack === "prod";
const tags = { Project: project, Environment: stack, ManagedBy: "Pulumi" };

const table = new aws.dynamodb.Table("data", {
  name: `${project}-${stack}`,
  billingMode: "PAY_PER_REQUEST",
  hashKey: "PK",
  rangeKey: "SK",
  attributes: [
    { name: "PK", type: "S" }, { name: "SK", type: "S" },
    { name: "GSI1PK", type: "S" }, { name: "GSI1SK", type: "S" },
    { name: "GSI2PK", type: "S" }, { name: "GSI2SK", type: "S" },
  ],
  globalSecondaryIndexes: [
    { name: "GSI1", hashKey: "GSI1PK", rangeKey: "GSI1SK", projectionType: "ALL" },
    { name: "GSI2", hashKey: "GSI2PK", rangeKey: "GSI2SK", projectionType: "ALL" },
  ],
  pointInTimeRecovery: { enabled: isProduction },
  serverSideEncryption: { enabled: true },
  ttl: { attributeName: "expiresAt", enabled: true },
  deletionProtectionEnabled: isProduction,
  tags,
});

const siteBucket = new aws.s3.BucketV2("site", { tags });
new aws.s3.BucketPublicAccessBlock("site-public-access", {
  bucket: siteBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});
new aws.s3.BucketServerSideEncryptionConfigurationV2("site-encryption", {
  bucket: siteBucket.id,
  rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } }],
});
new aws.s3.BucketVersioningV2("site-versioning", {
  bucket: siteBucket.id,
  versioningConfiguration: { status: "Enabled" },
});

const userPool = new aws.cognito.UserPool("users", {
  name: `${project}-${stack}`,
  usernameAttributes: ["email"],
  autoVerifiedAttributes: ["email"],
  accountRecoverySetting: { recoveryMechanisms: [{ name: "verified_email", priority: 1 }] },
  passwordPolicy: {
    minimumLength: 12,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true,
    requireUppercase: true,
    temporaryPasswordValidityDays: 3,
  },
  userAttributeUpdateSettings: { attributesRequireVerificationBeforeUpdates: ["email"] },
  deletionProtection: isProduction ? "ACTIVE" : "INACTIVE",
  tags,
});

const account = aws.getCallerIdentityOutput({});
const region = aws.getRegionOutput({});
const authDomain = new aws.cognito.UserPoolDomain("auth-domain", {
  domain: pulumi.interpolate`${project}-${stack}-${account.accountId}`,
  userPoolId: userPool.id,
});

const httpApi = new aws.apigatewayv2.Api("api", {
  name: `${project}-${stack}`,
  protocolType: "HTTP",
  disableExecuteApiEndpoint: false,
  tags,
});
new aws.apigatewayv2.Stage("default", {
  apiId: httpApi.id,
  name: "$default",
  autoDeploy: true,
  defaultRouteSettings: { throttlingBurstLimit: 50, throttlingRateLimit: 25 },
  tags,
});

const originAccessControl = new aws.cloudfront.OriginAccessControl("site", {
  name: `${project}-${stack}`,
  description: "Private AutoKeep web origin",
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});
const cachePolicy = new aws.cloudfront.CachePolicy("site", {
  name: `${project}-${stack}-site`,
  defaultTtl: 3600,
  maxTtl: 31_536_000,
  minTtl: 0,
  parametersInCacheKeyAndForwardedToOrigin: {
    cookiesConfig: { cookieBehavior: "none" },
    headersConfig: { headerBehavior: "none" },
    queryStringsConfig: { queryStringBehavior: "none" },
    enableAcceptEncodingBrotli: true,
    enableAcceptEncodingGzip: true,
  },
});
const apiCachePolicy = new aws.cloudfront.CachePolicy("api", {
  name: `${project}-${stack}-api-disabled`,
  defaultTtl: 0, maxTtl: 0, minTtl: 0,
  parametersInCacheKeyAndForwardedToOrigin: {
    cookiesConfig: { cookieBehavior: "none" },
    headersConfig: { headerBehavior: "none" },
    queryStringsConfig: { queryStringBehavior: "none" },
    enableAcceptEncodingBrotli: true,
    enableAcceptEncodingGzip: true,
  },
});
const apiRequestPolicy = new aws.cloudfront.OriginRequestPolicy("api", {
  name: `${project}-${stack}-api`,
  cookiesConfig: { cookieBehavior: "none" },
  headersConfig: { headerBehavior: "whitelist", headers: { items: ["Authorization", "Content-Type", "Accept"] } },
  queryStringsConfig: { queryStringBehavior: "none" },
});
const responseHeaders = new aws.cloudfront.ResponseHeadersPolicy("security", {
  name: `${project}-${stack}-security`,
  securityHeadersConfig: {
    contentSecurityPolicy: {
      contentSecurityPolicy: pulumi.interpolate`default-src 'self'; connect-src 'self' https://cognito-idp.${region.name}.amazonaws.com https://*.auth.${region.name}.amazoncognito.com; font-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://*.auth.${region.name}.amazoncognito.com`,
      override: true,
    },
    contentTypeOptions: { override: true },
    frameOptions: { frameOption: "DENY", override: true },
    referrerPolicy: { referrerPolicy: "strict-origin-when-cross-origin", override: true },
    strictTransportSecurity: { accessControlMaxAgeSec: 63_072_000, includeSubdomains: true, preload: true, override: true },
  },
});

const apiDomain = httpApi.apiEndpoint.apply((endpoint) => new URL(endpoint).hostname);
const distribution = new aws.cloudfront.Distribution("web", {
  enabled: true,
  defaultRootObject: "index.html",
  priceClass: "PriceClass_100",
  origins: [
    {
      domainName: siteBucket.bucketRegionalDomainName,
      originId: "site",
      originAccessControlId: originAccessControl.id,
      s3OriginConfig: { originAccessIdentity: "" },
    },
    {
      domainName: apiDomain,
      originId: "api",
      customOriginConfig: { httpPort: 80, httpsPort: 443, originProtocolPolicy: "https-only", originSslProtocols: ["TLSv1.2"] },
    },
  ],
  defaultCacheBehavior: {
    targetOriginId: "site",
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    cachedMethods: ["GET", "HEAD"],
    cachePolicyId: cachePolicy.id,
    responseHeadersPolicyId: responseHeaders.id,
  },
  orderedCacheBehaviors: [{
    pathPattern: "/api/*",
    targetOriginId: "api",
    viewerProtocolPolicy: "https-only",
    allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
    cachedMethods: ["GET", "HEAD"],
    cachePolicyId: apiCachePolicy.id,
    originRequestPolicyId: apiRequestPolicy.id,
    responseHeadersPolicyId: responseHeaders.id,
  }],
  restrictions: { geoRestriction: { restrictionType: "none" } },
  viewerCertificate: { cloudfrontDefaultCertificate: true, minimumProtocolVersion: "TLSv1.2_2021" },
  tags,
});
export const applicationUrl = pulumi.interpolate`https://${distribution.domainName}`;

new aws.s3.BucketPolicy("site", {
  bucket: siteBucket.id,
  policy: pulumi.all([siteBucket.arn, distribution.arn]).apply(([bucketArn, distributionArn]) => JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Sid: "AllowCloudFrontReadOnly",
      Effect: "Allow",
      Principal: { Service: "cloudfront.amazonaws.com" },
      Action: "s3:GetObject",
      Resource: `${bucketArn}/*`,
      Condition: { StringEquals: { "AWS:SourceArn": distributionArn } },
    }],
  })),
});

const identityProviders: aws.cognito.UserPoolIdentityProvider[] = [];
const supportedIdentityProviders: string[] = ["COGNITO"];
const googleClientId = config.get("googleClientId");
const googleClientSecret = config.getSecret("googleClientSecret");
if (googleClientId && googleClientSecret) {
  identityProviders.push(new aws.cognito.UserPoolIdentityProvider("google", {
    userPoolId: userPool.id,
    providerName: "Google",
    providerType: "Google",
    providerDetails: { client_id: googleClientId, client_secret: googleClientSecret, authorize_scopes: "openid email profile" },
    attributeMapping: { email: "email", name: "name", username: "sub" },
  }));
  supportedIdentityProviders.push("Google");
}
const appleClientId = config.get("appleClientId");
const appleTeamId = config.get("appleTeamId");
const appleKeyId = config.get("appleKeyId");
const applePrivateKey = config.getSecret("applePrivateKey");
if (appleClientId && appleTeamId && appleKeyId && applePrivateKey) {
  identityProviders.push(new aws.cognito.UserPoolIdentityProvider("apple", {
    userPoolId: userPool.id,
    providerName: "SignInWithApple",
    providerType: "SignInWithApple",
    providerDetails: {
      client_id: appleClientId, team_id: appleTeamId, key_id: appleKeyId,
      private_key: applePrivateKey, authorize_scopes: "email name",
    },
    attributeMapping: { email: "email", name: "name", username: "sub" },
  }));
  supportedIdentityProviders.push("SignInWithApple");
}

const userPoolClient = new aws.cognito.UserPoolClient("web", {
  name: `${project}-${stack}-web`,
  userPoolId: userPool.id,
  generateSecret: false,
  supportedIdentityProviders,
  allowedOauthFlowsUserPoolClient: true,
  allowedOauthFlows: ["code"],
  allowedOauthScopes: ["openid", "email", "profile"],
  callbackUrls: [applicationUrl, "http://localhost:5173"],
  logoutUrls: [applicationUrl, "http://localhost:5173"],
  preventUserExistenceErrors: "ENABLED",
  accessTokenValidity: 1,
  idTokenValidity: 1,
  refreshTokenValidity: 30,
  tokenValidityUnits: { accessToken: "hours", idToken: "hours", refreshToken: "days" },
  explicitAuthFlows: ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"],
}, { dependsOn: identityProviders });

const authorizer = new aws.apigatewayv2.Authorizer("jwt", {
  apiId: httpApi.id,
  authorizerType: "JWT",
  identitySources: ["$request.header.Authorization"],
  name: `${project}-${stack}-cognito`,
  jwtConfiguration: {
    issuer: pulumi.interpolate`https://cognito-idp.${region.name}.amazonaws.com/${userPool.id}`,
    audiences: [userPoolClient.id],
  },
});

const notificationTopic = new aws.sns.Topic("notifications", {
  name: `${project}-${stack}-notifications`,
  kmsMasterKeyId: "alias/aws/sns",
  tags,
});
new aws.sesv2.EmailIdentity("sender", { emailIdentity: senderEmail, tags });

const lambdaRole = new aws.iam.Role("lambda", {
  name: `${project}-${stack}-lambda`,
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
  tags,
});
new aws.iam.RolePolicy("lambda", {
  role: lambdaRole.id,
  policy: pulumi.all([table.arn, notificationTopic.arn]).apply(([tableArn, topicArn]) => JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"], Resource: "arn:aws:logs:*:*:log-group:/aws/lambda/autokeep-*:*" },
      { Effect: "Allow", Action: ["xray:PutTraceSegments", "xray:PutTelemetryRecords"], Resource: "*" },
      { Effect: "Allow", Action: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:TransactWriteItems"], Resource: [tableArn, `${tableArn}/index/*`] },
      { Effect: "Allow", Action: ["ses:SendEmail"], Resource: "*" },
      { Effect: "Allow", Action: ["sns:Publish"], Resource: topicArn },
    ],
  })),
});

const lambdaEnvironment = {
  TABLE_NAME: table.name,
  SENDER_EMAIL: senderEmail,
  NOTIFICATION_TOPIC_ARN: notificationTopic.arn,
};
const apiFunction = new aws.lambda.Function("api", {
  name: `${project}-${stack}-api`,
  role: lambdaRole.arn,
  runtime: "nodejs20.x",
  handler: "handler.handler",
  code: new pulumi.asset.FileArchive("../services/api/dist"),
  memorySize: 512,
  timeout: 15,
  environment: { variables: lambdaEnvironment },
  tracingConfig: { mode: "Active" },
  tags,
});
const workerFunction = new aws.lambda.Function("worker", {
  name: `${project}-${stack}-worker`,
  role: lambdaRole.arn,
  runtime: "nodejs20.x",
  handler: "worker.handler",
  code: new pulumi.asset.FileArchive("../services/api/dist"),
  memorySize: 512,
  timeout: 300,
  environment: { variables: lambdaEnvironment },
  tracingConfig: { mode: "Active" },
  tags,
});
for (const [name, fn] of [["api", apiFunction], ["worker", workerFunction]] as const) {
  new aws.cloudwatch.LogGroup(`${name}-logs`, {
    name: pulumi.interpolate`/aws/lambda/${fn.name}`,
    retentionInDays: isProduction ? 90 : 30,
    tags,
  });
}

const integration = new aws.apigatewayv2.Integration("api", {
  apiId: httpApi.id,
  integrationType: "AWS_PROXY",
  integrationUri: apiFunction.arn,
  integrationMethod: "POST",
  payloadFormatVersion: "2.0",
  timeoutMilliseconds: 15_000,
});
const routes = [
  "GET /api/me/organizations",
  "POST /api/organizations",
  "POST /api/invitations/accept",
  "GET /api/organizations/{organizationId}/dashboard",
  "GET /api/organizations/{organizationId}/members",
  "POST /api/organizations/{organizationId}/vehicles",
  "POST /api/organizations/{organizationId}/invitations",
  "POST /api/organizations/{organizationId}/vehicles/{vehicleId}/odometer",
  "POST /api/organizations/{organizationId}/vehicles/{vehicleId}/oil-changes",
  "PUT /api/organizations/{organizationId}/vehicles/{vehicleId}/driver",
  "DELETE /api/organizations/{organizationId}/vehicles/{vehicleId}",
  "DELETE /api/organizations/{organizationId}/members/{memberId}",
];
for (const [index, routeKey] of routes.entries()) {
  new aws.apigatewayv2.Route(`route-${index}`, {
    apiId: httpApi.id,
    routeKey,
    target: pulumi.interpolate`integrations/${integration.id}`,
    authorizationType: "JWT",
    authorizerId: authorizer.id,
  });
}
new aws.apigatewayv2.Route("health", {
  apiId: httpApi.id,
  routeKey: "GET /api/health",
  target: pulumi.interpolate`integrations/${integration.id}`,
  authorizationType: "NONE",
});
new aws.lambda.Permission("api-gateway", {
  action: "lambda:InvokeFunction",
  function: apiFunction.name,
  principal: "apigateway.amazonaws.com",
  sourceArn: pulumi.interpolate`${httpApi.executionArn}/*/*`,
});

const dailyRule = new aws.cloudwatch.EventRule("daily", {
  name: `${project}-${stack}-daily-monitor`,
  scheduleExpression: "cron(0 23 * * ? *)",
  description: "Evaluates AutoKeep calibration and maintenance alerts daily",
  tags,
});
new aws.cloudwatch.EventTarget("daily", { rule: dailyRule.name, arn: workerFunction.arn });
new aws.lambda.Permission("daily", {
  action: "lambda:InvokeFunction",
  function: workerFunction.name,
  principal: "events.amazonaws.com",
  sourceArn: dailyRule.arn,
});

new aws.dynamodb.TableItem("runtime-config", {
  tableName: table.name,
  hashKey: table.hashKey,
  rangeKey: table.rangeKey,
  item: applicationUrl.apply((url) => JSON.stringify({
    PK: { S: "SYSTEM#CONFIG" }, SK: { S: "WEB" }, entityType: { S: "CONFIG" }, applicationUrl: { S: url },
  })),
});

const runtimeConfig = pulumi.all([applicationUrl, userPool.id, userPoolClient.id, region.name]).apply(([url, poolId, clientId, regionName]) => JSON.stringify({
  apiBaseUrl: "",
  authority: `https://cognito-idp.${regionName}.amazonaws.com/${poolId}`,
  clientId,
  redirectUri: url,
  logoutUri: url,
}));
new aws.s3.BucketObjectv2("runtime-config", {
  bucket: siteBucket.id,
  key: "config.json",
  content: runtimeConfig,
  contentType: "application/json",
  cacheControl: "no-store",
});

function filesIn(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(fullPath) : [fullPath];
  });
}

const webRoot = path.resolve("../apps/web/dist");
if (!fs.existsSync(webRoot)) throw new Error("Frontend build not found. Run npm run build before pulumi up.");
for (const filePath of filesIn(webRoot)) {
  const key = path.relative(webRoot, filePath).split(path.sep).join("/");
  if (key === "config.json") continue;
  new aws.s3.BucketObjectv2(`asset-${key.replace(/[^a-zA-Z0-9]/g, "-")}`, {
    bucket: siteBucket.id,
    key,
    source: new pulumi.asset.FileAsset(filePath),
    contentType: mime.lookup(filePath) || "application/octet-stream",
    cacheControl: key === "index.html" ? "no-cache" : "public,max-age=31536000,immutable",
  });
}

export const apiEndpoint = httpApi.apiEndpoint;
export const userPoolId = userPool.id;
export const userPoolClientId = userPoolClient.id;
export const notificationTopicArn = notificationTopic.arn;
export const hostedUiDomain = pulumi.interpolate`https://${authDomain.domain}.auth.${region.name}.amazoncognito.com`;
