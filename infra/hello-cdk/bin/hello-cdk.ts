#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { HelloCdkStack } from '../lib/hello-cdk-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { EcrStack } from '../lib/ecr-stack';

const app = new cdk.App();
new HelloCdkStack(app, 'HelloCdkStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  env: { account: '691537867581', region: 'eu-central-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
// Dev stack
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

// ECR Dev stack
new EcrStack(app, 'EcrDevStack', {
  repositoryName: 'cloudsheets-backend-dev',
  environment: 'dev',
}, {
  env: { account: '691537867581', region: 'eu-central-1' },
});

// ECR Prod stack
new EcrStack(app, 'EcrStack', {
  repositoryName: 'cloudsheets-backend',
  environment: 'prod',
}, {
  env: { account: '691537867581', region: 'eu-central-1' },
});
