import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

if (!existsSync('.env')) {
  const secret = () => randomBytes(24).toString('base64url');
  writeFileSync(
    '.env',
    `DEMO_PASSWORD=${secret()}\nPORT=8080\nAPP_ORIGIN=http://localhost:8080\nSEED_DEMO=true\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log('Configuração local criada. Use npm run credentials para ver os acessos.');
}
for (const key of ['DEMO_PASSWORD']) {
  if (!new RegExp(`^${key}=.+$`, 'm').test(readFileSync('.env', 'utf8'))) {
    console.error(`Preencha ${key} no .env antes de continuar.`);
    process.exit(1);
  }
}
let command = 'docker';
let prefix = ['compose'];
if (spawnSync(command, [...prefix, 'version'], { stdio: 'ignore' }).status !== 0) {
  command = 'docker-compose';
  prefix = [];
  if (spawnSync(command, ['version'], { stdio: 'ignore' }).status !== 0) {
    console.error('Instale Docker com Compose e inicie o Docker Desktop ou Colima.');
    process.exit(1);
  }
}
const action = process.argv[2] === 'down' ? ['down'] : ['up', '--build'];
if (action[0] === 'up')
  console.log('AutoKeep: http://localhost:8080 • acessos: npm run credentials');
const child = spawn(command, [...prefix, ...action], { stdio: 'inherit' });
child.on('error', () => {
  console.error('Não foi possível iniciar o Docker.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
