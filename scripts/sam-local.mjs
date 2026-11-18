import { spawn } from 'node:child_process';

// Credenciais fictícias limitadas ao subprocesso. Não altera perfis reais do usuário.
const env = {
  ...process.env,
  AWS_ACCESS_KEY_ID: 'AUTOKEEPLOCAL',
  AWS_SECRET_ACCESS_KEY: 'local-development-only',
  AWS_REGION: 'us-east-1',
  AWS_DEFAULT_REGION: 'us-east-1',
  AWS_EC2_METADATA_DISABLED: 'true',
};
for (const key of ['AWS_SESSION_TOKEN', 'AWS_SECURITY_TOKEN', 'AWS_PROFILE', 'AWS_DEFAULT_PROFILE']) delete env[key];
// Todos os argumentos são constantes do projeto; não encaminha entrada ao shell Windows.
const child = spawn(process.platform === 'win32' ? 'sam.cmd' : 'sam', [
  'local', 'start-api', '--template', '.aws-sam/build/template.yaml',
  '--host', '127.0.0.1', '--port', '3000', '--region', 'us-east-1',
], { env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('error', error => {
  console.error(`Não foi possível iniciar SAM: ${error.message}. Confira a instalação e reabra o terminal.`);
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
