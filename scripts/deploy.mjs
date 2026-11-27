import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// CD publishes application artifacts only. Infrastructure changes need manual review.
export function validateDeploymentPreview(preview, stack) {
  if (!['dev', 'prod'].includes(stack)) throw new Error('Use dev ou prod.');
  if (!Array.isArray(preview.steps) || preview.steps.length === 0)
    throw new Error('Preview sem operações reconhecidas; publicação bloqueada.');
  for (const step of preview.steps) {
    const [prefix, project, type, name] = (step.urn || '').split('::');
    if (prefix !== `urn:pulumi:${stack}` || project !== 'autokeep' || !type || !name)
      throw new Error('Recurso fora da stack esperada; publicação bloqueada.');
    if (step.op === 'same') continue;
    if (type === 'pulumi:pulumi:Stack' && step.op === 'update') continue;
    if (type === 'aws:lambda/function:Function' && name === 'api' && step.op === 'update') {
      const changes = Object.keys(step.detailedDiff || {}).map((key) => key.split(/[.[]/)[0]);
      if (changes.length > 0 && changes.every((key) => ['code', 'sourceCodeHash'].includes(key)))
        continue;
    }
    if (
      stack === 'prod' &&
      type === 'aws:s3/bucketObjectv2:BucketObjectv2' &&
      /^web-[a-f0-9]{12}$/.test(name) &&
      ['create', 'update', 'delete'].includes(step.op) &&
      (step.newState || step.oldState)?.inputs?.bucket === 'autokeep-prod-web-672791231338'
    )
      continue;
    throw new Error(`Alteração de infraestrutura exige revisão manual: ${step.op} ${type} ${name}`);
  }
}

export function deploy(stack) {
  if (!['dev', 'prod'].includes(stack)) throw new Error('Use dev ou prod.');
  const directory = mkdtempSync(join(tmpdir(), 'autokeep-deploy-'));
  const plan = join(directory, 'plan.json');
  const target = `riedel-gabriela-org/autokeep/${stack}`;
  try {
    const preview = spawnSync(
      'pulumi',
      ['preview', '--stack', target, '--save-plan', plan, '--json', '--non-interactive'],
      { cwd: 'pulumi-start-aws', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    if (preview.stderr) process.stderr.write(preview.stderr);
    if (preview.error || preview.status !== 0) throw new Error('Falha no preview Pulumi.');
    validateDeploymentPreview(JSON.parse(preview.stdout), stack);
    // Apply the exact plan that passed the guard, never an unreviewed second preview.
    const update = spawnSync(
      'pulumi',
      [
        'up',
        '--stack',
        target,
        '--plan',
        plan,
        '--yes',
        '--skip-preview',
        '--non-interactive',
        '--suppress-outputs',
      ],
      { cwd: 'pulumi-start-aws', stdio: 'inherit' },
    );
    if (update.error || update.status !== 0) throw new Error('Falha na publicação Pulumi.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    deploy(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
