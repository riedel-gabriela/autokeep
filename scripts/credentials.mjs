import { existsSync, readFileSync } from 'node:fs';

const cloud = process.argv.includes('--cloud');
const path = cloud ? '.env.cloud.local' : '.env';
if (!existsSync(path)) {
  console.error(cloud ? 'Credenciais do deploy não configuradas.' : 'Execute npm run dev primeiro.');
  process.exit(1);
}
const password = readFileSync(path, 'utf8').match(/^DEMO_PASSWORD=(.+)$/m)?.[1];
if (!password) {
  console.error(`DEMO_PASSWORD não configurada no ${path}.`);
  process.exit(1);
}
console.log(
  `Acessos de demonstração (${cloud ? 'Vercel' : 'Docker local'}):\n\nMeu carro:       ana@autokeep.local\nGestora de frota: marina@autokeep.local\nMotorista:       lucas@autokeep.local\n\nSenha: ${password}\n\nPreserve o arquivo ${path}.`,
);
