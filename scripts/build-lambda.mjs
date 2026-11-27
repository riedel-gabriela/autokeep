import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const output = 'dist/lambda';
if (!existsSync('dist/web/index.html'))
  throw new Error('Execute npm run build antes de build:lambda.');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
rmSync('dist/autokeep-lambda.zip', { force: true });
execFileSync(process.execPath, [
  'node_modules/rolldown/bin/cli.mjs',
  'lambda/index.ts',
  '--platform=node',
  '--format=cjs',
  '--file=dist/lambda/index.js',
  '--no-codeSplitting',
]);
cpSync('dist/web', `${output}/web`, { recursive: true });
if (process.platform === 'win32') {
  execFileSync('tar.exe', [
    '-a',
    '-cf',
    'dist/autokeep-lambda.zip',
    '-C',
    output,
    'index.js',
    'web',
  ]);
} else {
  execFileSync('zip', ['-q', '-r', resolve('dist/autokeep-lambda.zip'), 'index.js', 'web'], {
    cwd: output,
  });
}
console.log('Pacote Lambda: dist/autokeep-lambda.zip');
