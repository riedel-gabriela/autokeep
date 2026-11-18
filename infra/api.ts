import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

export function createDevelopmentApi(args: {
  environment: string;
  accountId: string;
  region: string;
  tableArn: pulumi.Input<string>;
  tableName: pulumi.Input<string>;
  provider: aws.Provider;
  code: pulumi.asset.Archive;
}) {
  if (args.environment !== 'dev') throw new Error('Publicação de API habilitada somente em dev nesta etapa.');
  const name = 'autokeep-dev-api';
  const tags = { Project: 'autokeep', Environment: 'dev', ManagedBy: 'Pulumi' };
  const opts = { provider: args.provider };
  const logGroup = new aws.cloudwatch.LogGroup('api-logs', {
    name: `/aws/lambda/${name}`, retentionInDays: 14, tags,
  }, opts);
  const role = new aws.iam.Role('api-role', {
    name: `${name}-role`,
    assumeRolePolicy: JSON.stringify({ Version: '2012-10-17', Statement: [{
      Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole',
    }] }), tags,
  }, opts);
  const policy = new aws.iam.RolePolicy('api-policy', {
    role: role.id,
    policy: pulumi.all([args.tableArn, logGroup.arn]).apply(([tableArn, logArn]) => {
      const expected = `arn:aws:dynamodb:${args.region}:${args.accountId}:table/autokeep-dev`;
      if (tableArn !== expected) throw new Error('A API dev só pode receber acesso à tabela autokeep-dev da conta/região configuradas.');
      return JSON.stringify({ Version: '2012-10-17', Statement: [
        { Sid: 'DevelopmentTableOnly', Effect: 'Allow',
          Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Query'], Resource: tableArn },
        { Sid: 'OwnLogsOnly', Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: `${logArn}:*` },
      ] });
    }),
  }, opts);
  const api = new aws.apigatewayv2.Api('http-api', { name: 'autokeep-dev', protocolType: 'HTTP', tags }, opts);
  const fn = new aws.lambda.Function('api-function', {
    name, role: role.arn, runtime: 'nodejs24.x', handler: 'index.handler',
    architectures: ['x86_64'], memorySize: 512, timeout: 30, code: args.code,
    environment: { variables: {
      NODE_ENV: 'production', DYNAMODB_TABLE: args.tableName,
      APP_ORIGIN: api.apiEndpoint, SEED_DEMO: 'false',
    } }, tags,
  }, { ...opts, dependsOn: [policy, logGroup] });
  const integration = new aws.apigatewayv2.Integration('api-integration', {
    apiId: api.id, integrationType: 'AWS_PROXY', integrationUri: fn.invokeArn,
    integrationMethod: 'POST', payloadFormatVersion: '2.0', timeoutMilliseconds: 29_000,
  }, opts);
  const permission = new aws.lambda.Permission('api-invoke', {
    action: 'lambda:InvokeFunction', function: fn.name,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*/api/*`,
    sourceAccount: args.accountId,
  }, opts);
  const route = new aws.apigatewayv2.Route('api-proxy', {
    apiId: api.id, routeKey: 'ANY /api/{proxy+}', authorizationType: 'NONE',
    target: pulumi.interpolate`integrations/${integration.id}`,
  }, opts);
  const stage = new aws.apigatewayv2.Stage('api-stage', {
    apiId: api.id, name: '$default', autoDeploy: true,
    defaultRouteSettings: { throttlingBurstLimit: 10, throttlingRateLimit: 5 }, tags,
  }, { ...opts, dependsOn: [route, permission] });
  // Sessões e autorização de organização continuam na aplicação; health é público.
  return { endpoint: api.apiEndpoint, functionName: fn.name, roleArn: role.arn, logGroupName: logGroup.name, ready: stage.id };
}
