import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { zipSync } from 'fflate';

mkdirSync('dist/lambda', { recursive: true });
await build({
  entryPoints: ['lambda/index.ts'], bundle: true, platform: 'node',
  target: 'node24', format: 'cjs', outfile: 'dist/lambda/index.cjs',
});
writeFileSync('dist/autokeep-lambda.zip', zipSync({ 'index.cjs': readFileSync('dist/lambda/index.cjs') }));
console.log('Pacote Lambda: dist/autokeep-lambda.zip (index.cjs, Node.js 24)');
