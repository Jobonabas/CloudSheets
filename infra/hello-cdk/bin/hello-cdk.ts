#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FrontendStack } from '../lib/frontend-stack';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();
new FrontendStack(app, 'FrontendDevStack', {
  bucketName: 'cloudsheets-frontend-dev-bucket',
  environment: 'dev',
}, {
  env: { account: '691537867581', region: 'eu-central-1' },
});
new BackendStack(app, 'BackendDevStack', {
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
new BackendStack(app, 'BackendStack', {
  environment: 'prod',
}, {
  env: { account: '691537867581', region: 'eu-central-1' },
});
