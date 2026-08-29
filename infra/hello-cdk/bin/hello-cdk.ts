#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FrontendStack } from '../lib/frontend-stack';
import { BackendStack } from '../lib/backend-stack';
import { EcrStack } from '../lib/ecr-stack';
import { EcsExpressStack } from '../lib/ecs-express-stack';
import { CloudWatchDashboardStack } from '../lib/cloudwatch-dashboard-stack';
import {
  ENVIRONMENTS,
  backendImageUri,
  resolveEnvironment,
  scopedName,
} from '../lib/environment';

const app = new cdk.App();
const env = { account: '691537867581', region: 'eu-central-1' };

// Everything below is derived from this one value -- stack ids, physical names, the
// ECR repository and the image URI. Passing an unknown name throws here instead of
// synthesizing a half-configured app (issue #54).
const environment = resolveEnvironment(app.node.tryGetContext('environment'));
const { ecrStack, ecrRepository } = ENVIRONMENTS[environment];

// The pipeline passes the commit SHA via `-c backendImageTag=<sha>`.
// `latest` is the fallback for manual deploys without context.
const backendImageTag = app.node.tryGetContext('backendImageTag') ?? 'latest';
const imageUri =
  app.node.tryGetContext('backendImageUri') ??
  backendImageUri(environment, env.account, env.region, backendImageTag);

// The custom resource that copies the DB credentials into Parameter Store only re-runs
// when its properties change. Bump this (`-c dbSyncVersion=2`) to force a re-sync after
// an out-of-band password rotation in Secrets Manager.
const dbSyncVersion = app.node.tryGetContext('dbSyncVersion') ?? '1';

const backendStack = new BackendStack(
  app,
  scopedName('BackendStack', environment),
  { environment, dbSyncVersion },
  { env },
);

const frontendStack = new FrontendStack(
  app,
  scopedName('FrontendStack', environment),
  {
    // S3 bucket names are globally unique, so dev and prod cannot share one.
    bucketName: scopedName('cloudsheets-frontend-bucket', environment),
    environment,
  },
  { env },
);

// Only the ECR registry of the selected environment is part of the app. `cdk deploy
// --all -c environment=dev` therefore cannot create the prod repository, and
// `cdk deploy EcrStack -c environment=dev` fails with "no stack found" rather than
// pushing dev images into the prod registry.
new EcrStack(
  app,
  ecrStack,
  {
    repositoryName: ecrRepository,
    environment,
  },
  { env },
);

// ECS Express Mode backend service (replaces deprecated App Runner)
new EcsExpressStack(
  app,
  scopedName('EcsExpressStack', environment),
  {
    environment,
    //Cross Stack References:
    cognitoUserPoolId: frontendStack.userPoolId,
    cognitoClientId: frontendStack.userPoolClientId,
    cognitoDomain: frontendStack.cognitoDomain,
    // Config:
    imageUri,
    database: backendStack.postgresDB,
    dbCredentials: backendStack.dbCredentials,
    vpc: backendStack.vpc,
    backendSecurityGroup: backendStack.backendSG,
  },
  { env },
);

if (environment === 'dev') {
  new CloudWatchDashboardStack(
    app,
    scopedName('CloudWatchDashboardStack', environment),
    {
      environment,
      serviceName: scopedName('cloudsheets-backend', environment),
      dbInstanceIdentifier: backendStack.postgresDB.instanceIdentifier,
      distributionId: frontendStack.distributionId, 
    },
    { env },
  )
}
