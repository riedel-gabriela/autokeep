import { spawnSync } from 'node:child_process';

// Run explicitly in the trusted Codespace, after authorizing GitHub CLI.
// Values go to gh stdin, never command arguments, files or console output.
const names = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'PULUMI_ACCESS_TOKEN'];
if (process.env.AWS_SESSION_TOKEN) names.push('AWS_SESSION_TOKEN');
for (const name of names) {
  if (!process.env[name]) throw new Error(`Secret ausente no Codespace: ${name}`);
}
const env = { ...process.env };
delete env.GITHUB_TOKEN;
delete env.GH_TOKEN;
const repo = 'riedel-gabriela/autokeep';
const access = spawnSync('gh', ['api', `repos/${repo}/actions/secrets/public-key`], {
  env,
  stdio: ['ignore', 'ignore', 'inherit'],
});
if (access.error || access.status !== 0) {
  console.error('Autorize o GitHub CLI com acesso aos secrets do repositório antes de continuar.');
  process.exit(1);
}
for (const name of names) {
  const result = spawnSync('gh', ['secret', 'set', name, '--repo', repo, '--app', 'actions'], {
    env,
    input: process.env[name],
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.error || result.status !== 0) {
    console.error(`Não foi possível cadastrar ${name}; confira o acesso do GitHub CLI.`);
    process.exit(1);
  }
  console.log(`Secret cadastrado: ${name}`);
}
