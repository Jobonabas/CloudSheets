import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { EcsExpressStack } from '../lib/ecs-express-stack';
import { BackendStack } from '../lib/backend-stack';

const TEST_IMAGE_URI =
  '123456789012.dkr.ecr.eu-central-1.amazonaws.com/cloudsheets-backend-dev:testsha';

describe('EcsExpressStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();

    const backendStack = new BackendStack(app, 'TestBackendStack', {
      environment: 'dev',
    })
    const stack = new EcsExpressStack(app, 'TestEcsExpressStack', {
       environment: 'dev',
       cognitoUserPoolId: 'test-pool',
       cognitoClientId: 'test-client',
       cognitoDomain: 'https://example.com',
       imageUri: TEST_IMAGE_URI,
       vpc: backendStack.vpc,
       backendSecurityGroup: backendStack.backendSG,
       database: backendStack.postgresDB
      });
    template = Template.fromStack(stack);
  });

  test('creates an ECS Express Gateway Service running the backend image', () => {
    template.hasResourceProperties('AWS::ECS::ExpressGatewayService', {
      ServiceName: 'cloudsheets-backend',
      Cpu: '256',
      Memory: '512',
      HealthCheckPath: '/health',
      PrimaryContainer: {
        Image: TEST_IMAGE_URI,
        ContainerPort: 8080,
      },
    });
  });

  test('passes the runtime configuration to the container', () => {
    const services = template.findResources('AWS::ECS::ExpressGatewayService');
    const service = Object.values(services)[0] as any;
    const environment: Array<{ Name: string; Value: unknown }> =
      service.Properties.PrimaryContainer.Environment;

    const byName = (name: string) => environment.find((e) => e.Name === name);

    expect(byName('COGNITO_USER_POOL_ID')?.Value).toBe('test-pool');
    expect(byName('COGNITO_CLIENT_ID')?.Value).toBe('test-client');
    expect(byName('COGNITO_DOMAIN')?.Value).toBe('https://example.com');
    // NODE_ENV=production selects the knexfile "production" section (SSL on).
    expect(byName('NODE_ENV')?.Value).toBe('production');
    expect(byName('DB_SSL')?.Value).toBe('true');
    expect(byName('PORT')?.Value).toBe('8080');
    // DATABASE_URL is a CloudFormation intrinsic (Fn::Join over the RDS secret).
    expect(byName('DATABASE_URL')).toBeDefined();
  });

  test('honours containerPort and healthCheckPath overrides', () => {
    const app = new cdk.App();
    const backendStack = new BackendStack(app, 'OverrideBackendStack', {
      environment: 'dev',
    });
    const stack = new EcsExpressStack(app, 'OverrideEcsExpressStack', {
      environment: 'dev',
      cognitoUserPoolId: 'test-pool',
      cognitoClientId: 'test-client',
      cognitoDomain: 'https://example.com',
      imageUri: TEST_IMAGE_URI,
      containerPort: 3000,
      healthCheckPath: '/ping',
      vpc: backendStack.vpc,
      backendSecurityGroup: backendStack.backendSG,
      database: backendStack.postgresDB,
    });

    Template.fromStack(stack).hasResourceProperties('AWS::ECS::ExpressGatewayService', {
      HealthCheckPath: '/ping',
      PrimaryContainer: {
        ContainerPort: 3000,
      },
    });
  });

  test('creates an ECS Task Execution Role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
          },
        ],
      },
    });
  });

  test('creates an ECS Infrastructure Role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: { Service: 'ecs.amazonaws.com' },
          },
        ],
      },
    });
  });

  test('has HTTPS endpoint output', () => {
    template.hasOutput('EcsExpressEndpoint', {
      Description: 'ECS Express Service Endpoint (HTTPS)',
    });
  });

  test('has service ARN output', () => {
    template.hasOutput('EcsExpressServiceArn', {
      Description: 'ECS Express Service ARN',
    });
  });
});
