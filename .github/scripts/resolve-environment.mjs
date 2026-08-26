#!/usr/bin/env node
/**
 * Turns the single CDK_ENVIRONMENT knob into the names the pipeline needs.
 *
 * Issue #54: the workflow used to carry CDK_ENVIRONMENT, ECR_REPOSITORY and
 * ECR_STACK as three independent literals. Changing one and forgetting the others
 * deployed dev infrastructure while pushing to -- and pulling from -- the prod
 * registry. Both names are now derived from the same infra/hello-cdk/lib/
 * environments.json that bin/hello-cdk.ts reads, so the pipeline and the CDK app
 * cannot disagree.
 *
 * Usage: node resolve-environment.mjs <environments.json> <environment>
 * Prints KEY=value lines for $GITHUB_OUTPUT.
 *
 * If ECR_STACK or ECR_REPOSITORY are set in the environment, they are treated as
 * an assertion, not an override: a value that disagrees with the mapping fails the
 * job. That is the guard against someone re-introducing the literals.
 */
import { readFileSync } from 'node:fs';

const [mapPath, environment] = process.argv.slice(2);

if (!mapPath || !environment) {
  fail('usage: resolve-environment.mjs <environments.json> <environment>');
}

function fail(message) {
  // ::error:: renders the message in the job log and on the run summary.
  console.log(`::error title=Environment configuration::${message}`);
  process.exit(1);
}

let map;
try {
  map = JSON.parse(readFileSync(mapPath, 'utf8'));
} catch (error) {
  fail(`cannot read the environment mapping at ${mapPath}: ${error.message}`);
}

const known = Object.keys(map);
const config = map[environment];

if (!config) {
  fail(
    `CDK_ENVIRONMENT is "${environment}", which ${mapPath} does not define. ` +
      `Known environments: ${known.join(', ')}.`,
  );
}

// Both are unset in a healthy workflow. They exist here so that re-adding either
// one as a literal fails loudly instead of silently winning over the mapping.
const assertions = {
  ECR_STACK: config.ecrStack,
  ECR_REPOSITORY: config.ecrRepository,
};

for (const [name, expected] of Object.entries(assertions)) {
  const actual = process.env[name];
  if (actual && actual !== expected) {
    fail(
      `${name} is set to "${actual}", but CDK_ENVIRONMENT="${environment}" maps to ` +
        `"${expected}" in ${mapPath}. Deploying with this combination would mix ` +
        `environments. Remove the ${name} override -- it is derived, not configured.`,
    );
  }
}

// Every other stack of this environment carries the same suffix, so the deploy log
// and the job summary name exactly what CloudFormation will touch.
const suffix = config.stackSuffix ?? '';
const stacks = ['BackendStack', 'FrontendStack', 'EcsExpressStack']
  .map((base) => `${base}${suffix}`)
  .concat(config.ecrStack);

process.stdout.write(
  [
    `name=${environment}`,
    `ecr_stack=${config.ecrStack}`,
    `ecr_repository=${config.ecrRepository}`,
    `stacks=${stacks.join(' ')}`,
    '',
  ].join('\n'),
);
