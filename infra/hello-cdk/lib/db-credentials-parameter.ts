import { ArnFormat, CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Code, Function as LambdaFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Effect, IGrantable, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';

/**
 * The SSM Parameter Store names holding the database credentials, derived from the
 * environment so dev and prod can never collide.
 *
 * Exported so BackendStack (which writes them) and EcsExpressStack (which reads them)
 * share one definition of the naming convention.
 */
export function dbParameterNames(environment: 'dev' | 'prod') {
  const prefix = `/cloudsheets/${environment}/db`;
  return {
    username: `${prefix}/username`,
    password: `${prefix}/password`,
  };
}

/**
 * Builds the ARN of an SSM parameter in the scope's own stack.
 *
 * Deliberately not `StringParameter.fromStringParameterName`: that synthesizes an
 * `AWS::SSM::Parameter::Value<String>` CloudFormation *template parameter*, which
 * CloudFormation resolves at the very start of a deployment. On a first deploy the
 * parameter does not exist yet -- it is created mid-deploy by the custom resource
 * below -- so the stack would fail before it ever ran. We only ever need the ARN.
 */
export function dbParameterArn(scope: Construct, parameterName: string): string {
  return Stack.of(scope).formatArn({
    service: 'ssm',
    resource: 'parameter',
    // formatArn joins resource and resourceName with '/', and parameter names are
    // themselves '/'-prefixed, so the leading slash has to go.
    resourceName: parameterName.replace(/^\//, ''),
    arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
  });
}

export interface DbCredentialsToSsmProps {
  /** The RDS-managed Secrets Manager secret to copy from. */
  secret: ISecret;
  /** Controls delete behaviour -- see the note on `retainOnDelete` below. */
  environment: 'dev' | 'prod';
  /**
   * Bump to force a re-sync. The custom resource only runs when its properties
   * change, so an out-of-band password rotation in Secrets Manager would otherwise
   * leave the SSM copy stale. Deploy with `-c dbSyncVersion=<n+1>` to re-run it.
   */
  syncVersion?: string;
}

/**
 * Copies the database username and password out of the RDS-managed Secrets Manager
 * secret into SSM Parameter Store, so ECS can inject them into the container at task
 * start instead of them being resolved into a plain environment variable.
 *
 * A custom resource is required because CloudFormation cannot create SecureString
 * parameters -- `AWS::SSM::Parameter` supports only String and StringList. CDK
 * documents this on `ParameterType.SECURE_STRING` but does not enforce it, so passing
 * that type to `StringParameter` synthesizes cleanly and then fails at deploy time.
 *
 * The Lambda receives only the secret *ARN* (which is not sensitive) and reads the
 * value itself, so no plaintext credential ever enters the CloudFormation template.
 */
export class DbCredentialsToSsm extends Construct {
  public readonly usernameParameterName: string;
  public readonly passwordParameterName: string;

  private readonly parameterArns: string[];

  constructor(scope: Construct, id: string, props: DbCredentialsToSsmProps) {
    super(scope, id);

    const names = dbParameterNames(props.environment);
    this.usernameParameterName = names.username;
    this.passwordParameterName = names.password;
    this.parameterArns = [
      dbParameterArn(this, names.username),
      dbParameterArn(this, names.password),
    ];

    const onEvent = new LambdaFunction(this, 'SyncHandler', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: Duration.minutes(2),
      // The Node.js 18+ Lambda runtimes ship AWS SDK v3, so the handler needs no
      // bundling and stays well under the 4096-character inline code limit.
      code: Code.fromInline(HANDLER_SOURCE),
    });

    props.secret.grantRead(onEvent);
    onEvent.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
        resources: this.parameterArns,
      }),
    );

    const provider = new Provider(this, 'Provider', { onEventHandler: onEvent });

    new CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      resourceType: 'Custom::DbCredentialsToSsm',
      properties: {
        secretArn: props.secret.secretArn,
        usernameParameterName: this.usernameParameterName,
        passwordParameterName: this.passwordParameterName,
        syncVersion: props.syncVersion ?? '1',
        // Prod RDS uses RemovalPolicy.RETAIN. Deleting the parameters alongside the
        // stack would leave a retained production database with no stored credentials,
        // so outside dev the parameters outlive the stack that created them.
        retainOnDelete: String(props.environment !== 'dev'),
      },
    });
  }

  /** Grants read access to both parameters -- for the ECS *execution* role, which is
   *  what fetches secrets before the container starts. */
  public grantRead(grantee: IGrantable): void {
    grantee.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParameters', 'ssm:GetParameter'],
        resources: this.parameterArns,
      }),
    );
  }
}

/**
 * Inline handler source. Kept as a module-level constant so the construct body stays
 * readable. Never logs the secret value.
 */
const HANDLER_SOURCE = `
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SSMClient, PutParameterCommand, DeleteParameterCommand } = require('@aws-sdk/client-ssm');

const secretsManager = new SecretsManagerClient({});
const ssm = new SSMClient({});

exports.handler = async (event) => {
  const props = event.ResourceProperties;
  const physicalResourceId = 'dbcreds:' + props.usernameParameterName;

  if (event.RequestType === 'Delete') {
    if (props.retainOnDelete !== 'true') {
      for (const name of [props.usernameParameterName, props.passwordParameterName]) {
        try {
          await ssm.send(new DeleteParameterCommand({ Name: name }));
        } catch (err) {
          if (err.name !== 'ParameterNotFound') throw err;
        }
      }
    }
    return { PhysicalResourceId: physicalResourceId };
  }

  const result = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: props.secretArn }),
  );
  const { username, password } = JSON.parse(result.SecretString);
  if (!username || !password) {
    throw new Error('Secret ' + props.secretArn + ' has no username/password field');
  }

  await ssm.send(new PutParameterCommand({
    Name: props.usernameParameterName,
    Value: username,
    Type: 'String',
    Overwrite: true,
  }));
  await ssm.send(new PutParameterCommand({
    Name: props.passwordParameterName,
    Value: password,
    Type: 'SecureString',
    Overwrite: true,
  }));

  return { PhysicalResourceId: physicalResourceId };
};
`;
