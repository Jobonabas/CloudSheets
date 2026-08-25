import environments from './environments.json';

/**
 * The one place where an environment name is turned into concrete names.
 *
 * The mapping itself lives in `environments.json`, not in this module, because the
 * CI workflow has to read it too: `.github/workflows/deploy.yml` derives ECR_STACK
 * and ECR_REPOSITORY from the same file with `node -p`. A TypeScript-only table
 * would have forced the workflow to keep its own copy, which is exactly the drift
 * this construct exists to prevent (issue #54) -- change the repository name in one
 * place and the pipeline would keep pushing to the old one.
 */
export type EnvironmentName = keyof typeof environments;

export interface EnvironmentConfig {
  /** CDK stack id of the ECR registry for this environment. */
  readonly ecrStack: string;
  /** ECR repository the backend image is pushed to and pulled from. */
  readonly ecrRepository: string;
  /**
   * Appended to every other stack id and to the physical names that have to be
   * unique per account.
   *
   * Empty for `dev` on purpose: the dev stacks are already deployed under their
   * unsuffixed names (`BackendStack`, `FrontendStack`, `EcsExpressStack`) and the
   * S3 bucket exists as `cloudsheets-frontend-bucket`. Renaming them would not move
   * those resources -- CloudFormation would create a second set and leave the RDS
   * instance, the bucket and the CloudFront distribution behind, still billing.
   */
  readonly stackSuffix: string;
}

export const ENVIRONMENTS: Record<EnvironmentName, EnvironmentConfig> = environments;

export const ENVIRONMENT_NAMES = Object.keys(ENVIRONMENTS) as EnvironmentName[];

/**
 * Narrows the raw `-c environment=...` context value to a known environment.
 *
 * Without this, a typo used to sail straight through: `appConfig['prd']` is
 * `undefined`, spreading it produced a config without `environment`, and the stacks
 * synthesized with `removalPolicy` and Cognito domain silently taking the prod
 * branch of every `=== 'dev'` check.
 */
export function resolveEnvironment(raw: unknown): EnvironmentName {
  if (raw === undefined || raw === null || raw === '') {
    return 'dev';
  }
  if (typeof raw === 'string' && (ENVIRONMENT_NAMES as string[]).includes(raw)) {
    return raw as EnvironmentName;
  }
  throw new Error(
    `Unknown environment '${String(raw)}'. ` +
      `Pass -c environment=<${ENVIRONMENT_NAMES.join('|')}>.`,
  );
}

/**
 * Stack id / physical name for `base` in the given environment.
 *
 * Used for both, so a stack and the resources inside it can never end up scoped to
 * different environments: `EcsExpressStack-prod` always contains the ECS service
 * named `cloudsheets-backend-prod`.
 */
export function scopedName(base: string, environment: EnvironmentName): string {
  return `${base}${ENVIRONMENTS[environment].stackSuffix}`;
}

/** Full image URI the pipeline pushes to and the ECS service pulls from. */
export function backendImageUri(
  environment: EnvironmentName,
  account: string,
  region: string,
  tag: string,
): string {
  return `${account}.dkr.ecr.${region}.amazonaws.com/${ENVIRONMENTS[environment].ecrRepository}:${tag}`;
}
