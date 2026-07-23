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
const frontendPath =  environment === 'dev'
 ? '../../frontend/.env.dev'
 : '../../frontend/.env.prod';

const config = appConfig[environment as 'dev' | 'prod'];

const backendStack = new BackendStack(app, 'BackendStack', 
  config
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

// ECS Express Mode Hello World stack (replaces deprecated App Runner)
new EcsExpressStack(app, 'EcsExpressStack', {
  environment,
  cognitoUserPoolId: frontendStack.userPoolId,
  cognitoClientId: frontendStack.userPoolClientId,
  cognitoDomain: frontendStack.cognitoDomain,
  database: backendStack.postgresDB,
}, {
  env,
});
