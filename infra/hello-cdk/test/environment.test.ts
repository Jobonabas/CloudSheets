import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { EcrStack } from '../lib/ecr-stack';
import {
  ENVIRONMENTS,
  ENVIRONMENT_NAMES,
  EnvironmentName,
  backendImageUri,
  resolveEnvironment,
  scopedName,
} from '../lib/environment';

const ACCOUNT = '691537867581';
const REGION = 'eu-central-1';

function ecrTemplate(environment: EnvironmentName): Template {
  const app = new cdk.App();
  const { ecrStack, ecrRepository } = ENVIRONMENTS[environment];
  const stack = new EcrStack(app, ecrStack, {
    repositoryName: ecrRepository,
    environment,
  });
  return Template.fromStack(stack);
}

describe('environment mapping', () => {
  test('knows exactly dev and prod', () => {
    expect(ENVIRONMENT_NAMES.slice().sort()).toEqual(['dev', 'prod']);
  });

  // Issue #54, tasks 3 and 4: these two rows are the mapping the pipeline relies on.
  // The workflow reads them out of the same lib/environments.json, so a change here
  // moves the pipeline with it -- and breaks this test if it moves by accident.
  test('dev maps to EcrDevStack and cloudsheets-backend-dev', () => {
    expect(ENVIRONMENTS.dev).toMatchObject({
      ecrStack: 'EcrDevStack',
      ecrRepository: 'cloudsheets-backend-dev',
    });
  });

  test('prod maps to EcrStack and cloudsheets-backend', () => {
    expect(ENVIRONMENTS.prod).toMatchObject({
      ecrStack: 'EcrStack',
      ecrRepository: 'cloudsheets-backend',
    });
  });

  test('the two environments share no stack id and no repository', () => {
    expect(ENVIRONMENTS.dev.ecrStack).not.toBe(ENVIRONMENTS.prod.ecrStack);
    expect(ENVIRONMENTS.dev.ecrRepository).not.toBe(ENVIRONMENTS.prod.ecrRepository);
  });
});

describe('resolveEnvironment', () => {
  test.each(ENVIRONMENT_NAMES)('accepts %s', (name) => {
    expect(resolveEnvironment(name)).toBe(name);
  });

  test('defaults to dev when no context is passed', () => {
    // `cdk synth` without -c environment=... is a local convenience, and local work
    // must never default to prod.
    expect(resolveEnvironment(undefined)).toBe('dev');
    expect(resolveEnvironment('')).toBe('dev');
  });

  test.each(['prd', 'Prod', 'staging', 'PROD', 'dev ', 42])(
    'rejects %p instead of synthesizing a half-configured app',
    (raw) => {
      // The old code did `appConfig[environment]`, which is `undefined` for a typo.
      // Spreading that produced a config without `environment`, so every
      // `=== 'dev'` check silently took the prod branch -- RETAIN removal policies
      // on what the author thought was a dev stack.
      expect(() => resolveEnvironment(raw)).toThrow(/Unknown environment/);
    },
  );
});

describe('scopedName', () => {
  test('leaves dev names untouched', () => {
    // The dev stacks are already deployed under these names. A suffix here would
    // not move them -- CloudFormation would build a second set and leave the RDS
    // instance, the bucket and the distribution orphaned but still billing.
    expect(scopedName('BackendStack', 'dev')).toBe('BackendStack');
    expect(scopedName('cloudsheets-frontend-bucket', 'dev')).toBe(
      'cloudsheets-frontend-bucket',
    );
  });

  test('gives prod its own names', () => {
    expect(scopedName('BackendStack', 'prod')).toBe('BackendStack-prod');
    expect(scopedName('EcsExpressStack', 'prod')).toBe('EcsExpressStack-prod');
    expect(scopedName('cloudsheets-frontend-bucket', 'prod')).toBe(
      'cloudsheets-frontend-bucket-prod',
    );
  });
});

describe('backendImageUri', () => {
  test('points dev at the dev repository', () => {
    expect(backendImageUri('dev', ACCOUNT, REGION, 'abc123')).toBe(
      `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/cloudsheets-backend-dev:abc123`,
    );
  });

  test('points prod at the prod repository', () => {
    expect(backendImageUri('prod', ACCOUNT, REGION, 'abc123')).toBe(
      `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/cloudsheets-backend:abc123`,
    );
  });
});

describe('EcrStack', () => {
  test.each(ENVIRONMENT_NAMES)(
    '%s synthesizes the repository the pipeline pushes to',
    (environment) => {
      ecrTemplate(environment).hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: ENVIRONMENTS[environment].ecrRepository,
      });
    },
  );

  test('dev throws its repository away with the stack, prod keeps it', () => {
    ecrTemplate('dev').hasResource('AWS::ECR::Repository', {
      DeletionPolicy: 'Delete',
    });
    ecrTemplate('prod').hasResource('AWS::ECR::Repository', {
      DeletionPolicy: 'Retain',
    });
  });
});

// Issue #54: the workflow used to carry CDK_ENVIRONMENT, ECR_REPOSITORY and
// ECR_STACK as three independent literals. Changing one and forgetting the others
// deployed dev infrastructure against the prod registry. Both are now derived from
// lib/environments.json at runtime, and this fails if the literals come back.
describe('.github/workflows/deploy.yml', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../../../.github/workflows/deploy.yml'),
    'utf8',
  );

  test('reads the mapping from lib/environments.json', () => {
    expect(workflow).toContain('infra/hello-cdk/lib/environments.json');
  });

  test('never assigns ECR_STACK or ECR_REPOSITORY a literal value', () => {
    // A literal is the whole bug: it survives a change to CDK_ENVIRONMENT and keeps
    // pointing at the other environment's registry. Values coming from
    // `${{ needs.environment.outputs.* }}` are fine -- those are derived.
    const literals = workflow
      .split(/\r?\n/)
      .filter((line) => /^\s*(ECR_STACK|ECR_REPOSITORY):/.test(line))
      .filter((line) => !line.includes('${{'));

    expect(literals).toEqual([]);
  });

  test('does not hardcode an ECR stack id', () => {
    for (const environment of ENVIRONMENT_NAMES) {
      expect(workflow).not.toContain(ENVIRONMENTS[environment].ecrStack);
    }
  });
});
