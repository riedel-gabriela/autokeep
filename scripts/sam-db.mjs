import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const aws = process.platform === 'win32' && existsSync('C:/Program Files/Amazon/AWSCLIV2/aws.exe')
  ? 'C:/Program Files/Amazon/AWSCLIV2/aws.exe' : 'aws';
const env = {
  ...process.env,
  AWS_ACCESS_KEY_ID: 'AUTOKEEPLOCAL',
  AWS_SECRET_ACCESS_KEY: 'local-development-only',
  AWS_EC2_METADATA_DISABLED: 'true',
  AWS_PAGER: '',
};
for (const key of ['AWS_SESSION_TOKEN', 'AWS_SECURITY_TOKEN', 'AWS_PROFILE', 'AWS_DEFAULT_PROFILE']) delete env[key];
const flags = ['--endpoint-url', 'http://127.0.0.1:8000', '--region', 'us-east-1', '--no-cli-pager'];
const run = args => spawnSync(aws, ['dynamodb', ...args, ...flags], { env, encoding: 'utf8' });

// Endpoint e nome são fixos: o inicializador não utiliza os bancos AWS.
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  const result = run(['list-tables']);
  if (result.status === 0) { ready = true; break; }
  if (result.error) throw result.error;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!ready) throw new Error('DynamoDB local indisponível na porta 8000. Execute npm run sam:db.');
const describe = run(['describe-table', '--table-name', 'autokeep-local']);
if (describe.status === 0) {
  const table = JSON.parse(describe.stdout).Table;
  if (!table.KeySchema.some(k => k.AttributeName === 'pk' && k.KeyType === 'HASH') ||
      !table.KeySchema.some(k => k.AttributeName === 'sk' && k.KeyType === 'RANGE')) {
    throw new Error('Tabela local existente tem chaves incompatíveis; nenhum dado foi alterado.');
  }
  console.log('Tabela autokeep-local já existe; dados preservados.');
} else {
  if (!describe.stderr.includes('ResourceNotFoundException')) throw new Error(describe.stderr || 'Falha ao consultar tabela local.');
  const result = run(['create-table', '--table-name', 'autokeep-local',
    '--attribute-definitions', 'AttributeName=pk,AttributeType=S', 'AttributeName=sk,AttributeType=S',
    '--key-schema', 'AttributeName=pk,KeyType=HASH', 'AttributeName=sk,KeyType=RANGE',
    '--billing-mode', 'PAY_PER_REQUEST']);
  if (result.status !== 0) throw new Error(result.stderr || 'Falha ao criar tabela local.');
  console.log('Tabela autokeep-local criada no Docker, sem acessar AWS.');
}
