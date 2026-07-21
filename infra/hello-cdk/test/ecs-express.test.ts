import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { EcsExpressStack } from '../lib/ecs-express-stack';

describe('EcsExpressStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new EcsExpressStack(app, 'TestEcsExpressStack', { environment: 'dev', cognitoUserPoolId: 'test-pool', cognitoClientId: 'test-client', cognitoDomain: 'https://example.com'});
    template = Template.fromStack(stack);
  });

  test('creates an ECS Express Gateway Service', () => {
    template.hasResourceProperties('AWS::ECS::ExpressGatewayService', {
      ServiceName: 'cloudsheets-hello-world',
      Cpu: '256',
      Memory: '512',
      HealthCheckPath: '/',
      PrimaryContainer: {
        Image: 'public.ecr.aws/docker/library/nginx:latest',
        ContainerPort: 80,
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
