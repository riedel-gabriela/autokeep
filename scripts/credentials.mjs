import { existsSync, readFileSync } from 'node:fs';
if (!existsSync('.env')) {
  console.error('Execute npm run dev primeiro.');
  process.exit(1);
}
const password = readFileSync('.env', 'utf8').match(/^DEMO_PASSWORD=(.+)$/m)?.[1];
if (!password) {
  console.error('DEMO_PASSWORD não configurada no .env.');
  process.exit(1);
}
console.log(
  `Acessos locais de demonstração:\n\nMeu carro:       ana@autokeep.local\nGestora de frota: marina@autokeep.local\nMotorista:       lucas@autokeep.local\n\nSenha: ${password}\n\nA senha é definida na primeira inicialização do banco. Preserve o arquivo .env.`,
);
