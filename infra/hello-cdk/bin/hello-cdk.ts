#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { HelloCdkStack } from '../lib/hello-cdk-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { BackendStack } from '../lib/backend-stack';
import { EcrStack } from '../lib/ecr-stack';
import { EcsExpressStack } from '../lib/ecs-express-stack';

const app = new cdk.App();
const env = { account: '691537867581', region: 'eu-central-1' };

new HelloCdkStack(app, 'HelloCdkStack', {
  env,
});

// Dev stack
new FrontendStack(app, 'FrontendDevStack', {
  bucketName: 'cloudsheets-frontend-dev-bucket',
  environment: 'dev',
}, {
  env,
});

new BackendStack(app, 'BackendDevStack', {
  environment: 'dev',
}, {
  env,
});

// Prod stack
new FrontendStack(app, 'FrontendStack', {
  bucketName: 'cloudsheets-frontend-bucket',
  environment: 'prod',
}, {
  env,
});

new BackendStack(app, 'BackendStack', {
  environment: 'prod',
}, {
  env,
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

// ECS Express Mode Hello World stack (replaces deprecated App Runner)
new EcsExpressStack(app, 'EcsExpressStack', {
  env,
});
