#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FrontendStack } from '../lib/frontend-stack';
import { BackendStack, BackendStackConfig } from '../lib/backend-stack';
import * as fs from 'fs';

const app = new cdk.App();

// Define the type alias
type EnvType = 'dev' | 'prod';

// Apply the type to the object
const appConfig: Record<EnvType, BackendStackConfig> = {
  dev: {
    environment: 'dev',
    callbackUrl: 'http://localhost:5173/',
    logoutUrl: 'http://localhost:5173/',
  },
  prod: {
    environment: 'prod',
    callbackUrl: 'https://your-production-domain.com/',
    logoutUrl: 'https://your-production-domain.com/',
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
  cognitoConfig: {
    userPoolId: backendStack.userPoolId,
    clientId: backendStack.userPoolClientId,
    cognitoDomain: backendStack.cognitoDomainUrl,
    callbackUrl: config.callbackUrl,
    logoutUrl: config.logoutUrl,
    authority: backendStack.authority
  }

}, {
  env: { account: '691537867581', region: 'eu-central-1' },
});

frontendStack.addDependency(backendStack)