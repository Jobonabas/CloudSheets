# Deployment

The pipeline in `.github/workflows/deploy.yml` builds, tests and deploys CloudSheets.
This page describes how it picks a target environment and how to move it from `dev`
to `prod`.

## One switch, everything else derived

There is exactly one place where the target environment is chosen:

```yaml
# .github/workflows/deploy.yml
env:
  CDK_ENVIRONMENT: dev
```

The ECR repository, the ECR stack and the names of all CDK stacks are **derived** from
that value — they are never configured separately. The mapping lives in
`infra/hello-cdk/lib/environments.json`, which both sides read:

* the workflow, through `.github/scripts/resolve-environment.mjs`
* the CDK app, through `infra/hello-cdk/lib/environment.ts`

| | `dev` | `prod` |
| --- | --- | --- |
| ECR stack | `EcrDevStack` | `EcrStack` |
| ECR repository | `cloudsheets-backend-dev` | `cloudsheets-backend` |
| Database / VPC | `BackendStack` | `BackendStack-prod` |
| S3 / CloudFront / Cognito | `FrontendStack` | `FrontendStack-prod` |
| Backend service | `EcsExpressStack` | `EcsExpressStack-prod` |
| Frontend bucket | `cloudsheets-frontend-bucket` | `cloudsheets-frontend-bucket-prod` |
| ECS service | `cloudsheets-backend` | `cloudsheets-backend-prod` |
| Cognito domain prefix | `cloudsheets-auth-dev` | `cloudsheets-auth-prod` |
| SSM credentials | `/cloudsheets/dev/db/*` | `/cloudsheets/prod/db/*` |

!!! note "Why `dev` has no suffix"
    The dev stacks are already deployed under their unsuffixed names. Renaming them
    would not move anything: CloudFormation would create a second set and leave the
    RDS instance, the S3 bucket and the CloudFront distribution behind — orphaned but
    still billing. `prod` is the environment that does not exist yet, so it is the one
    that gets the suffix. The ECR stacks keep their historical names for the same
    reason.

## Promoting the pipeline from dev to prod

1. **Change the one line** in `.github/workflows/deploy.yml`:

    ```yaml
    CDK_ENVIRONMENT: prod
    ```

    Do not add `ECR_REPOSITORY` or `ECR_STACK` next to it. The `environment` job fails
    the run if either is set to anything other than the derived value.

2. **Open a pull request against `develop`.** The pull request already runs
   `CDK synth (prod)`, which synthesizes the full prod app and asserts that it
   contains prod stacks only. A mismatch fails there, before any AWS call.

3. **Check `cdk diff` for prod locally** before merging:

    ```sh
    cd infra/hello-cdk
    npx cdk diff --all -c environment=prod
    ```

    Everything should show up as *new*. If a resource shows as a modification, a name
    is still shared between the two environments and prod would take dev's resource
    over.

4. **Merge.** A push to `develop` or `main` runs the deploy job; the target
   environment is printed as a run annotation and in the job summary.

5. **Verify in AWS** — the parameters carry the environment in their path:

    ```sh
    aws ssm get-parameters-by-path --path /cloudsheets/prod/db --recursive
    aws ecs describe-services --cluster <cluster> --services cloudsheets-backend-prod
    curl -fsS https://<endpoint>/health
    ```

### Before the first prod deploy

* **It creates a second set of everything.** A second RDS instance, a second VPC with
  two NAT gateways (~$65/month, not free tier), a second CloudFront distribution.
  Nothing is shared with dev by design.
* **The Cognito callback URLs change**, because they are derived from the new
  CloudFront domain. Users of the dev pool do not exist in the prod pool.
* **`prod` removal policies are `RETAIN`.** `cdk destroy` will leave the database, the
  bucket, the ECR repository and the SSM parameters behind. That is intentional, but
  it means clean-up is manual.
* **Both environments can run at the same time.** Deploying prod does not touch dev.
  If the intention is to *move* rather than to add, destroy dev afterwards:
  `npx cdk destroy --all -c environment=dev`.

## What stops a mismatched deployment

Four independent guards, in the order they fire:

| Guard | Where | Catches |
| --- | --- | --- |
| `resolve-environment.mjs` | `environment` job | an unknown `CDK_ENVIRONMENT`, or a re-introduced `ECR_STACK` / `ECR_REPOSITORY` that disagrees with the mapping |
| `test/environment.test.ts` | `test-infra` job | the mapping changing by accident, and the workflow starting to hardcode names again |
| `assert-environment-synth.mjs` | `synth-environments` job (dev **and** prod) | a synthesized app that contains a stack, a repository or a bucket of the other environment |
| `resolveEnvironment()` | every `cdk` invocation | `-c environment=<typo>`, which used to synthesize a half-configured app instead of failing |

Beyond that, `bin/hello-cdk.ts` only instantiates the stacks of the selected
environment. `cdk deploy --all -c environment=dev` therefore *cannot* create the prod
registry, and `cdk deploy EcrStack -c environment=dev` fails with "no stack found"
rather than pushing dev images into the prod registry.

## Which branches deploy

| Event | Runs | Deploys |
| --- | --- | --- |
| Pull request to `develop` or `main` | all checks | no |
| Push to `develop` | all checks | yes |
| Push to `main` | all checks | yes |
| `workflow_dispatch` | all checks | only on `develop` / `main` |

Pushes to a feature branch trigger nothing — open a pull request to get CI.

## Running the CDK app locally

```sh
cd infra/hello-cdk
npm ci

# dev is the default; prod has to be asked for explicitly
npx cdk synth --all
npx cdk synth --all -c environment=prod

# the frontend build has to exist first -- FrontendStack reads frontend/dist
cd ../../frontend && npm ci && npm run build
```

The same two scripts the pipeline uses run locally:

```sh
node .github/scripts/resolve-environment.mjs infra/hello-cdk/lib/environments.json dev
node .github/scripts/assert-environment-synth.mjs \
  infra/hello-cdk/lib/environments.json dev infra/hello-cdk/cdk.out
```
