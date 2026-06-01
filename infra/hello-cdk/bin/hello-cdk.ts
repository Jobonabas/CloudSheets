#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FrontendStack, FrontendStackConfig } from '../lib/frontend-stack';
import { BackendStack } from '../lib/backend-stack';
import * as fs from 'fs';

const app = new cdk.App();

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

frontendStack.addDependency(backendStack)