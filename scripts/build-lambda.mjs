import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const output = 'dist/lambda';
mkdirSync(output, { recursive: true });
rmSync('dist/autokeep-lambda.zip', { force: true });
execFileSync('node_modules/.bin/rolldown', [
  'lambda/index.ts',
  '--platform=node',
  '--format=cjs',
  '--file=dist/lambda/index.cjs',
]);
execFileSync('zip', ['-q', '-j', 'dist/autokeep-lambda.zip', `${output}/index.cjs`]);
console.log('Pacote Lambda: dist/autokeep-lambda.zip');
