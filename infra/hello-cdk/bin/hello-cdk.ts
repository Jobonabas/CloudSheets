#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FrontendStack } from '../lib/frontend-stack';
import { BackendStack, BackendStackConfig } from '../lib/backend-stack';
import * as fs from 'fs';
import { env } from 'process';

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

new FrontendStack(app, 'FrontendDevStack', {
  bucketName: 'cloudsheets-frontend-dev-bucket',
  environment: 'dev',
}, {
  env: { account: '691537867581', region: 'eu-central-1' },
});


// Prod stack
new FrontendStack(app, 'FrontendStack', {
  bucketName: 'cloudsheets-frontend-bucket',
  environment: 'prod',
}, {
  env: { account: '691537867581', region: 'eu-central-1' },
});


const backendStack = new BackendStack(app, 'BackendStack', 
  config
 , {
  env: { account: '691537867581', region: 'eu-central-1' },
});

app.synth();
fs.writeFileSync(frontendPath, `
  Vite_UserPoolId=${backendStack.userPoolId}
  Vite_UserPoolClientId=${backendStack.userPoolClientId}
  Vite_CognitoDomainUrl=${backendStack.cognitoDomainUrl}
  `);
