import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { BackendStack, DATABASE_NAME } from '../lib/backend-stack';

function templateFor(environment: 'dev' | 'prod'): Template {
  const app = new cdk.App();
  const stack = new BackendStack(app, `Test${environment}BackendStack`, { environment });
  return Template.fromStack(stack);
}

describe('BackendStack', () => {
  let template: Template;

  beforeAll(() => {
    template = templateFor('dev');
  });

  test('keeps the RDS-managed Secrets Manager secret as the source of truth', () => {
    // The custom resource copies FROM this secret, so it must still exist. Issue #20
    // moves credential *delivery* to Parameter Store, it does not remove the secret.
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
    });
  });

  test('creates the application database on the instance', () => {
    // Without DBName, RDS only ever has the engine default 'postgres' database and
    // `knex migrate:latest` dies with 'database "cloudsheet" does not exist',
    // which takes the whole container down via the && in the Dockerfile CMD.
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBName: DATABASE_NAME,
    });
  });

  test('creates no CloudFormation-native SSM parameters', () => {
    // CloudFormation cannot create SecureString parameters. A native AWS::SSM::Parameter
    // here would mean someone reached for ParameterType.SECURE_STRING, which synthesizes
    // cleanly and then fails at deploy time.
    template.resourceCountIs('AWS::SSM::Parameter', 0);
  });

  test('syncs the credentials into Parameter Store with a custom resource', () => {
    const resources = template.findResources('Custom::DbCredentialsToSsm');
    const resource = Object.values(resources)[0] as any;

    expect(resource).toBeDefined();
    expect(resource.Properties.usernameParameterName).toBe('/cloudsheets/dev/db/username');
    expect(resource.Properties.passwordParameterName).toBe('/cloudsheets/dev/db/password');
    expect(resource.Properties.syncVersion).toBe('1');
  });

  test('passes the sync version through so a rotation can be re-synced', () => {
    const app = new cdk.App();
    const stack = new BackendStack(app, 'SyncVersionBackendStack', {
      environment: 'dev',
      dbSyncVersion: '7',
    });

    const resources = Template.fromStack(stack).findResources('Custom::DbCredentialsToSsm');
    const resource = Object.values(resources)[0] as any;

    expect(resource.Properties.syncVersion).toBe('7');
  });

  test('grants the sync handler read on the secret and write on the parameters', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const statements = Object.values(policies).flatMap(
      (policy: any) => policy.Properties.PolicyDocument.Statement,
    );

    const readsSecret = statements.some((s: any) =>
      JSON.stringify(s.Action).includes('secretsmanager:GetSecretValue'),
    );
    const writesParameters = statements.find((s: any) =>
      JSON.stringify(s.Action).includes('ssm:PutParameter'),
    );

    expect(readsSecret).toBe(true);
    expect(writesParameters).toBeDefined();
    // Order-independent: CDK normalises and sorts policy actions during synth.
    expect([...writesParameters.Action].sort()).toEqual([
      'ssm:DeleteParameter',
      'ssm:PutParameter',
    ]);
    // Scoped to the two parameters, not '*'.
    expect(writesParameters.Resource).toHaveLength(2);
  });

  test('deletes the parameters in dev but retains them in prod', () => {
    const devResource = Object.values(
      templateFor('dev').findResources('Custom::DbCredentialsToSsm'),
    )[0] as any;
    const prodResource = Object.values(
      templateFor('prod').findResources('Custom::DbCredentialsToSsm'),
    )[0] as any;

    expect(devResource.Properties.retainOnDelete).toBe('false');
    // Prod RDS uses RemovalPolicy.RETAIN -- deleting the parameters would leave a
    // retained production database with no stored credentials.
    expect(prodResource.Properties.retainOnDelete).toBe('true');
    expect(prodResource.Properties.passwordParameterName).toBe('/cloudsheets/prod/db/password');
  });

  test('hands the sync handler only the secret ARN, never a resolved value', () => {
    const resource = Object.values(
      template.findResources('Custom::DbCredentialsToSsm'),
    )[0] as any;

    // A {{resolve:secretsmanager:...}} reference here would be resolved by
    // CloudFormation into the custom resource's properties, where it is readable via
    // DescribeStackResource and lands in the provider's CloudWatch logs. The handler
    // must receive a plain ARN reference and call GetSecretValue itself.
    const secretArn = JSON.stringify(resource.Properties.secretArn);
    expect(secretArn).not.toContain('resolve:secretsmanager');
    expect(resource.Properties.secretArn).toHaveProperty('Ref');
  });

  test('confines the secretsmanager dynamic reference to the RDS instance', () => {
    // RDS consuming its own generated secret via {{resolve:secretsmanager:...}} is the
    // standard CDK wiring and is safe -- MasterUserPassword is write-only and is not
    // returned by DescribeDBInstances. What issue #20 fixes is the same reference
    // landing on an ECS container environment variable, which IS readable.
    const rendered = template.toJSON();
    const withReference = Object.entries(rendered.Resources).filter(([, resource]: [string, any]) =>
      JSON.stringify(resource.Properties ?? {}).includes('resolve:secretsmanager'),
    );

    expect(withReference).toHaveLength(1);
    expect((withReference[0][1] as any).Type).toBe('AWS::RDS::DBInstance');
  });
});
