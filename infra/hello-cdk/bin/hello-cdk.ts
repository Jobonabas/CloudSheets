#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { DomainStack, DomainStackConfig } from '../lib/domain-stack';
import { FrontendStack, FrontendStackConfig } from '../lib/frontend-stack';
import { BackendStack } from '../lib/backend-stack';
import { EcrStack } from '../lib/ecr-stack';
import { EcsExpressStack } from '../lib/ecs-express-stack';
import { ApiStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';



const app = new cdk.App();
type EnvType = 'dev' | 'prod';
const env = { account: '691537867581', region: 'eu-central-1' };
const usEast1Env = { account: '691537867581', region: 'us-east-1' };
const environment = app.node.tryGetContext('environment') ?? 'dev';
const frontendPath = environment === 'dev'
  ? '../../frontend/.env.dev'
  : '../../frontend/.env.prod';
const DOMAIN_NAME = environment === 'prod' ? 'cloudsheets.eu.org' : 'dev.cloudsheets.eu.org';
const API_DOMAIN_NAME = `api.${DOMAIN_NAME}`;


// Define the type alias


// Apply the type to the object
const appConfig: Record<EnvType, Pick<FrontendStackConfig, 'bucketName' | 'environment'>> = {
  dev: {
    bucketName: 'cloudsheets-frontend-bucket-dev',
    environment: 'dev',
  },
  prod: {
    bucketName: 'cloudsheets-frontend-bucket-prod',
    environment: 'prod',
  },
};

const config = appConfig[environment as 'dev' | 'prod'];
const USE_CUSTOM_DOMAIN = false;


const authStack = new AuthStack(app, `AuthStack-${environment}`, {
  environment,
  callbackUrls: [`https://${DOMAIN_NAME}`]
}, { env });

const domainStack = new DomainStack(app, `DomainStack-${environment}`, {
  domainName: DOMAIN_NAME,
  environment,
  createCertificate: USE_CUSTOM_DOMAIN,
}, {
  env: usEast1Env,
  crossRegionReferences: true,
});


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



const backendStack = new BackendStack(app, `BackendStack-${environment}`,
  config
  , {
    env: { account: '691537867581', region: 'eu-central-1' },
  });

// ECS Express Mode backend service (replaces deprecated App Runner)
const ecsExpressStack = new EcsExpressStack(app, `EcsExpressStack-${environment}`, {
  environment,
  //Cross Stack References:
  cognitoUserPoolId: authStack.userPoolId,
  cognitoClientId: authStack.userPoolClientId,
  cognitoDomain: authStack.cognitoDomain,
  // Config:
  imageUri: backendImageUri,
  database: backendStack.postgresDB,
  vpc: backendStack.vpc,
  backendSecurityGroup: backendStack.backendSG,
  }, {
  env,
});

const frontendStack = new FrontendStack(app, `FrontendStack-${environment}`, {
  bucketName: config.bucketName,
  environment,
  apiUrl: USE_CUSTOM_DOMAIN ? `https://${API_DOMAIN_NAME}` : ecsExpressStack.endpoint,
  userPoolId: authStack.userPoolId,
  userPoolClientId: authStack.userPoolClientId,
  cognitoDomain: authStack.cognitoDomain,
  existingCallbackUrls: [`https://${DOMAIN_NAME}`],
  ...(USE_CUSTOM_DOMAIN ? {
    domainName: DOMAIN_NAME,
    hostedZone: domainStack.hostedZone,
    certificate: domainStack.certificate,
    webAcl: domainStack.webAcl,
  } : { webAcl: domainStack.webAcl, }),
}, {
  env: { account: '691537867581', region: 'eu-central-1' },
  crossRegionReferences: true,
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

new ApiStack(app, `ApiStack-${environment}`, {
  environment,
  apiDomainName: API_DOMAIN_NAME,
  hostedZone: domainStack.hostedZone,
  backendEndpoint: ecsExpressStack.endpoint,
  webAcl: domainStack.webAcl,
}, {
  env: usEast1Env,
  crossRegionReferences: true,
});

