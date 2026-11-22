import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const output = 'dist/lambda';
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
if (process.platform === 'win32') {
  execFileSync('tar.exe', ['-a', '-cf', 'dist/autokeep-lambda.zip', '-C', output, 'index.js']);
} else {
  execFileSync('zip', ['-q', '-j', 'dist/autokeep-lambda.zip', `${output}/index.js`]);
}
console.log('Pacote Lambda: dist/autokeep-lambda.zip');
