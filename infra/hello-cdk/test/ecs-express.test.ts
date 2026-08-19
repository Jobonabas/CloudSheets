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
       database: backendStack.postgresDB,
       dbCredentials: backendStack.dbCredentials
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
    // Non-sensitive connection details travel as ordinary environment variables.
    expect(byName('DB_HOST')).toBeDefined();
    expect(byName('DB_PORT')).toBeDefined();
    expect(byName('DB_NAME')?.Value).toBe('cloudsheet');
  });

  test('never places database credentials in plain environment variables', () => {
    const services = template.findResources('AWS::ECS::ExpressGatewayService');
    const service = Object.values(services)[0] as any;
    const environment: Array<{ Name: string; Value: unknown }> =
      service.Properties.PrimaryContainer.Environment;

    const names = environment.map((e) => e.Name);
    // Regression guard for issue #20: DATABASE_URL used to carry the password,
    // resolved out of the RDS secret at deploy time via unsafeUnwrap().
    expect(names).not.toContain('DATABASE_URL');
    expect(names).not.toContain('DB_USERNAME');
    expect(names).not.toContain('DB_PASSWORD');

    // Nothing in this stack should touch Secrets Manager any more. The RDS secret
    // itself still exists, but it lives in BackendStack -- see backend-stack.test.ts.
    expect(JSON.stringify(template.toJSON())).not.toContain('resolve:secretsmanager');
  });

  test('injects the credentials from Parameter Store at task start', () => {
    const services = template.findResources('AWS::ECS::ExpressGatewayService');
    const service = Object.values(services)[0] as any;
    const secrets: Array<{ Name: string; ValueFrom: unknown }> =
      service.Properties.PrimaryContainer.Secrets;

    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.Name).sort()).toEqual(['DB_PASSWORD', 'DB_USERNAME']);

    // Each ValueFrom is an SSM parameter ARN built with Fn::Join over the partition.
    for (const secret of secrets) {
      expect(JSON.stringify(secret.ValueFrom)).toContain(':ssm:');
      expect(JSON.stringify(secret.ValueFrom)).toContain('parameter/cloudsheets/dev/db/');
    }
  });

  test('grants the execution role read access to exactly the two parameters', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const statements = Object.values(policies).flatMap(
      (policy: any) => policy.Properties.PolicyDocument.Statement,
    );

    const ssmStatement = statements.find((s: any) =>
      JSON.stringify(s.Action).includes('ssm:GetParameters'),
    );

    expect(ssmStatement).toBeDefined();
    // Order-independent: CDK normalises and sorts policy actions during synth.
    expect([...ssmStatement.Action].sort()).toEqual(['ssm:GetParameter', 'ssm:GetParameters']);
    expect(ssmStatement.Resource).toHaveLength(2);
    expect(JSON.stringify(ssmStatement.Resource)).toContain('cloudsheets/dev/db/username');
    expect(JSON.stringify(ssmStatement.Resource)).toContain('cloudsheets/dev/db/password');
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
      dbCredentials: backendStack.dbCredentials,
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
