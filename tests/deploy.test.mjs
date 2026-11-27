import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploymentPreview } from '../scripts/deploy.mjs';

const step = (type, name, op = 'same', changes) => ({
  urn: `urn:pulumi:prod::autokeep::${type}::${name}`,
  op,
  detailedDiff:
    changes && Object.fromEntries(changes.map((key) => [key, { kind: 'update', inputDiff: true }])),
  newState: { inputs: { bucket: 'autokeep-prod-web-672791231338' } },
});
const lambda = 'aws:lambda/function:Function';
const object = 'aws:s3/bucketObjectv2:BucketObjectv2';
test('CD permits code updates and static asset rotation in the existing stack', () => {
  validateDeploymentPreview(
    {
      steps: [
        step('pulumi:pulumi:Stack', 'autokeep-prod'),
        step(lambda, 'api', 'update', ['code', 'sourceCodeHash', 'lastModified']),
        step(object, 'web-012345abcdef', 'create'),
        step(object, 'web-abcdef012345', 'delete'),
      ],
    },
    'prod',
  );
});
test('CD blocks additional services, replacement, permissions and Lambda configuration changes', () => {
  for (const change of [
    step('aws:s3/bucketV2:BucketV2', 'web', 'create'),
    step('aws:iam/rolePolicy:RolePolicy', 'policy', 'update'),
    step(lambda, 'api', 'replace'),
    step(lambda, 'api', 'update', ['environment']),
    step(lambda, 'api', 'update', ['memorySize']),
    step(lambda, 'api', 'update'),
  ])
    assert.throws(() => validateDeploymentPreview({ steps: [change] }, 'prod'));
});
test('CD rejects missing preview, foreign stack and static objects in dev', () => {
  assert.throws(() => validateDeploymentPreview({}, 'prod'));
  assert.throws(() => validateDeploymentPreview({ steps: [] }, 'prod'));
  assert.throws(() => validateDeploymentPreview({ steps: [step(lambda, 'api')] }, 'dev'));
  assert.throws(() =>
    validateDeploymentPreview({ steps: [step(object, 'web-012345abcdef', 'create')] }, 'invalid'),
  );
  const change = {
    ...step(object, 'web-012345abcdef', 'create'),
    urn: 'urn:pulumi:dev::autokeep::aws:s3/bucketObjectv2:BucketObjectv2::web-012345abcdef',
  };
  assert.throws(() => validateDeploymentPreview({ steps: [change] }, 'dev'));
});

test('CD binds static writes to the existing bucket, including deletes', () => {
  const deletion = step(object, 'web-012345abcdef', 'delete');
  deletion.oldState = deletion.newState;
  delete deletion.newState;
  validateDeploymentPreview({ steps: [deletion] }, 'prod');
  deletion.oldState.inputs.bucket = 'outro-bucket';
  assert.throws(() => validateDeploymentPreview({ steps: [deletion] }, 'prod'));
});
