import { spawn, spawnSync } from 'node:child_process';
import { developmentUrls } from './development-urls.mjs';

const { appOrigin } = developmentUrls();

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
const action = process.argv[2] === 'down' ? ['down'] : ['up', '--build', '--remove-orphans'];
if (action[0] === 'up') console.log(`AutoKeep: ${appOrigin} • acesso local: botão Entrar`);
const child = spawn(command, [...prefix, ...action], {
  stdio: 'inherit',
  env: {
    ...process.env,
    AUTOKEEP_APP_ORIGIN: appOrigin,
  },
});
child.on('error', () => {
  console.error('Não foi possível iniciar o Docker.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
