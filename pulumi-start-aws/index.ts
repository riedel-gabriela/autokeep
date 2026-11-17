import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

const stack = pulumi.getStack();
if (!['dev', 'prod'].includes(stack)) throw new Error('Use a stack dev ou prod.');
const config = new pulumi.Config();
const tableName = config.get('tableName') || `autokeep-${stack}`;
const functionName = config.get('functionName') || `autokeep-api-${stack}`;

// Read existing resources. No new AWS resource is created by this program.
const table = aws.dynamodb.Table.get('database', tableName);
const api = aws.lambda.Function.get('api', functionName);
export const databaseName = table.name;
export const databaseArn = table.arn;
export const apiName = api.name;
export const apiArn = api.arn;
export const region = aws.getRegionOutput().region;
