Object.assign(process.env, {
  NODE_ENV: 'development',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  DYNAMODB_ENDPOINT: 'http://127.0.0.1:8000',
  DYNAMODB_TABLE: 'autokeep-sam',
});
const { ensureLocalTable } = await import('../src/server/dynamo.ts');
await ensureLocalTable();
console.log('Tabela autokeep-sam pronta no DynamoDB Local.');
