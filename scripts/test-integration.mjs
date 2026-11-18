import { spawnSync } from 'node:child_process';
const name = `autokeep-test-${process.pid}`;
const command = (args, options = {}) => spawnSync('docker', args, { stdio: 'inherit', ...options });
let started = false;
try {
  const result = command([
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '-p',
    '127.0.0.1::8000',
    'amazon/dynamodb-local:3.1.0',
    '-jar',
    'DynamoDBLocal.jar',
    '-inMemory',
    '-sharedDb',
  ]);
  if (result.status !== 0)
    throw new Error('Não foi possível iniciar DynamoDB Local. Inicie o Docker.');
  started = true;
  const port = spawnSync('docker', ['port', name, '8000/tcp'], { encoding: 'utf8' })
    .stdout.trim()
    .split(':')
    .pop();
  if (!/^\d+$/.test(port || '')) throw new Error('Porta do banco local indisponível.');
  for (const origin of ['http://localhost:8080', 'https://codespaces-review-8080.app.github.dev']) {
    console.log(`Testando origem: ${origin}`);
    const test = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--test', 'tests/integration/api.test.ts'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          DYNAMODB_ENDPOINT: `http://127.0.0.1:${port}`,
          AUTOKEEP_TEST_ORIGIN: origin,
        },
      },
    );
    process.exitCode = test.status ?? 1;
    if (process.exitCode !== 0) break;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (started) command(['stop', name]);
}
