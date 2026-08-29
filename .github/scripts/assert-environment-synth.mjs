#!/usr/bin/env node
/**
 * Proves that a synthesized CDK app contains one environment and nothing else.
 *
 * Issue #54 asks for a pipeline that "cannot deploy with mismatched environment and
 * ECR settings". Deriving the names (resolve-environment.mjs) makes them consistent
 * on paper; this script checks the result against the templates CloudFormation will
 * actually receive -- the repository the image lands in, the repository the ECS
 * service pulls from, and the absence of any stack belonging to the other side.
 *
 * Usage: node assert-environment-synth.mjs <environments.json> <environment> <cdk.out>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [mapPath, environment, outDir] = process.argv.slice(2);
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const config = map[environment];

if (!config) {
  console.log(`::error::unknown environment "${environment}"`);
  process.exit(1);
}

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};

const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
const stacks = Object.entries(manifest.artifacts)
  .filter(([, artifact]) => artifact.type === 'aws:cloudformation:stack')
  .map(([id, artifact]) => [id, artifact]);

const stackIds = stacks.map(([id]) => id).sort();
const suffix = config.stackSuffix ?? '';
const expected = ['BackendStack', 'FrontendStack', 'EcsExpressStack', 'CloudWatchDashboardStack']
  .map((base) => `${base}${suffix}`)
  .concat(config.ecrStack)
  .sort();

check(
  JSON.stringify(stackIds) === JSON.stringify(expected),
  `synthesized stacks ${stackIds.join(', ')} -- expected exactly ${expected.join(', ')}`,
);

// The decisive one: no artifact of the *other* environment may be in the app, or a
// `cdk deploy --all` would reach across.
for (const [other, otherConfig] of Object.entries(map)) {
  if (other === environment) continue;
  const otherSuffix = otherConfig.stackSuffix ?? '';
  const forbidden = ['BackendStack', 'FrontendStack', 'EcsExpressStack', 'CloudWatchDashboardStack']
    .map((base) => `${base}${otherSuffix}`)
    .concat(otherConfig.ecrStack)
    // dev and prod share a base name only when both suffixes are empty, which the
    // mapping prevents -- but filtering keeps the check honest either way.
    .filter((id) => !expected.includes(id));

  for (const id of forbidden) {
    check(!stackIds.includes(id), `stack ${id} belongs to "${other}" but is in the ${environment} app`);
  }
}

const templateOf = (stackId) => {
  const entry = stacks.find(([id]) => id === stackId);
  if (!entry) return undefined;
  return JSON.parse(readFileSync(join(outDir, entry[1].properties.templateFile), 'utf8'));
};

const resourcesOfType = (template, type) =>
  Object.values(template?.Resources ?? {}).filter((r) => r.Type === type);

// 1. The registry the pipeline pushes to.
const ecrTemplate = templateOf(config.ecrStack);
const repositories = resourcesOfType(ecrTemplate, 'AWS::ECR::Repository');
check(repositories.length === 1, `${config.ecrStack} declares ${repositories.length} ECR repositories, expected 1`);
check(
  repositories[0]?.Properties?.RepositoryName === config.ecrRepository,
  `${config.ecrStack} creates "${repositories[0]?.Properties?.RepositoryName}", ` +
    `but the pipeline pushes to "${config.ecrRepository}"`,
);

// 2. The registry the service pulls from. This is the mismatch #54 is about: dev
//    infrastructure running the prod image, or the other way round.
const ecsTemplate = templateOf(`EcsExpressStack${suffix}`);
const services = resourcesOfType(ecsTemplate, 'AWS::ECS::ExpressGatewayService');
check(services.length === 1, `EcsExpressStack${suffix} declares ${services.length} services, expected 1`);
const image = services[0]?.Properties?.PrimaryContainer?.Image;
check(
  typeof image === 'string' && image.includes(`/${config.ecrRepository}:`),
  `the ECS service pulls "${image}", which is not the ${environment} repository ` +
    `"${config.ecrRepository}"`,
);

// 3. Bucket names are global, so a shared one would make the second environment
//    fail at deploy time -- after the RDS instance has already been created.
const s3Template = templateOf(`FrontendStack${suffix}`);
const buckets = resourcesOfType(s3Template, 'AWS::S3::Bucket');
const bucketName = buckets[0]?.Properties?.BucketName;
const otherBuckets = Object.entries(map)
  .filter(([other]) => other !== environment)
  .map(([, otherConfig]) => `cloudsheets-frontend-bucket${otherConfig.stackSuffix ?? ''}`);
check(
  typeof bucketName === 'string' && !otherBuckets.includes(bucketName),
  `FrontendStack${suffix} deploys into "${bucketName}", which belongs to another environment`,
);

if (problems.length > 0) {
  for (const problem of problems) {
    console.log(`::error title=Environment leak (${environment})::${problem}`);
  }
  process.exit(1);
}

console.log(
  `${environment}: ${stackIds.join(', ')} -- image repository ${config.ecrRepository}, bucket ${bucketName}`,
);
