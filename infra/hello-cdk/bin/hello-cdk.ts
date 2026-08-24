#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FrontendStack, FrontendStackConfig } from '../lib/frontend-stack';
import { BackendStack } from '../lib/backend-stack';
import { EcrStack } from '../lib/ecr-stack';
import { EcsExpressStack } from '../lib/ecs-express-stack';

const app = new cdk.App();
const env = { account: '691537867581', region: 'eu-central-1' };

// Define the type alias
type EnvType = 'dev' | 'prod';

// Apply the type to the object
const appConfig: Record<EnvType, FrontendStackConfig> = {
  dev: {
    bucketName: 'cloudsheets-frontend-bucket',
    environment: 'dev',
  
  },
  prod: {
    bucketName: 'cloudsheets-frontend-bucket',
    environment: 'prod',
  
  }
};

const environment = app.node.tryGetContext('environment') ?? 'dev';

const config = appConfig[environment as 'dev' | 'prod'];

// Backend container image.
// The repository name is derived from `environment` so the CI pipeline and the
// ECS service can never point at different ECR repositories. Keep the names in
// sync with the EcrDevStack / EcrStack definitions below.
const backendRepositoryName =
  environment === 'prod' ? 'cloudsheets-backend' : 'cloudsheets-backend-dev';

// The pipeline passes the commit SHA via `-c backendImageTag=<sha>`.
// `latest` is the fallback for manual deploys without context.
const backendImageTag = app.node.tryGetContext('backendImageTag') ?? 'latest';
const backendImageUri =
  app.node.tryGetContext('backendImageUri') ??
  `${env.account}.dkr.ecr.${env.region}.amazonaws.com/${backendRepositoryName}:${backendImageTag}`;

// The custom resource that copies the DB credentials into Parameter Store only re-runs
// when its properties change. Bump this (`-c dbSyncVersion=2`) to force a re-sync after
// an out-of-band password rotation in Secrets Manager.
const dbSyncVersion = app.node.tryGetContext('dbSyncVersion') ?? '1';

const backendStack = new BackendStack(app, 'BackendStack',
  { ...config, dbSyncVersion }
 , {
  env: { account: '691537867581', region: 'eu-central-1' },
});

const frontendStack = new FrontendStack(app, 'FrontendStack', {
  bucketName: 'cloudsheets-frontend-bucket',
  environment,
}, {
  env: { account: '691537867581', region: 'eu-central-1' },
});

// ECR Dev stack
new EcrStack(app, 'EcrDevStack', {
  repositoryName: 'cloudsheets-backend-dev',
  environment: 'dev',
}, {
  env,
});

// ECR Prod stack
new EcrStack(app, 'EcrStack', {
  repositoryName: 'cloudsheets-backend',
  environment: 'prod',
}, {
  env,
});

// ECS Express Mode backend service (replaces deprecated App Runner)
new EcsExpressStack(app, 'EcsExpressStack', {
  environment,
  //Cross Stack References:
  cognitoUserPoolId: frontendStack.userPoolId,
  cognitoClientId: frontendStack.userPoolClientId,
  cognitoDomain: frontendStack.cognitoDomain,
  // Config:
  imageUri: backendImageUri,
  database: backendStack.postgresDB,
  dbCredentials: backendStack.dbCredentials,
  vpc: backendStack.vpc,
  backendSecurityGroup: backendStack.backendSG,
}, {
  env,
});
