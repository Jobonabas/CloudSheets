import { Stack, StackProps, CfnOutput, Fn, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnExpressGatewayService } from 'aws-cdk-lib/aws-ecs';
import { Role, ServicePrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { Vpc, ISecurityGroup, ISubnet } from 'aws-cdk-lib/aws-ec2';
import { DbCredentialsToSsm, dbParameterArn } from './db-credentials-parameter';
import { DATABASE_NAME } from './backend-stack';
import { EnvironmentName, scopedName } from './environment';

export interface EcsExpressStackConfig {
  environment: EnvironmentName;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoDomain: string;
  /** Full ECR image URI including tag, e.g. <acct>.dkr.ecr.<region>.amazonaws.com/cloudsheets-backend-dev:<sha> */
  imageUri: string;
  /** Port the backend listens on. Must match PORT in the container. */
  containerPort?: number;
  /** Path the ECS Express health check probes. */
  healthCheckPath?: string;
  database: DatabaseInstance;
  /** Parameter Store copies of the DB credentials, created by BackendStack. */
  dbCredentials: DbCredentialsToSsm;
  vpc: Vpc;
  backendSecurityGroup: ISecurityGroup;
  /**
   * Public URL of the frontend. The backend registers @fastify/cors with exactly
   * this origin -- without it the browser blocks every request from the CloudFront
   * domain long before it reaches the container.
   */
  frontendUrl: string;
}

export class EcsExpressStack extends Stack {
  /** Gateway hostname -- note: no scheme, callers have to prefix https://. */
  public readonly endpoint: string;

  constructor(scope: Construct, id: string, config: EcsExpressStackConfig, props?: StackProps) {
    super(scope, id, props);
    
    // IAM Role: allows ECS to pull images and write logs
    const executionRole = new Role(this, 'EcsExpressExecutionRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this, 'ExecutionPolicy',
          'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // IAM Role: allows ECS Express Mode to provision infrastructure
    // (ALB, target groups, security groups, auto-scaling, CloudWatch alarms)
    const infrastructureRole = new Role(this, 'EcsExpressInfraRole', {
      assumedBy: new ServicePrincipal('ecs.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromManagedPolicyArn(this, 'InfraPolicy',
          'arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices'),
      ],
    });

    // DB Setup -- endpoint details are not sensitive and travel as plain env vars.
    // The credentials do NOT: they are read from SSM Parameter Store by the ECS agent
    // at task start (see `secrets` below). Resolving them here with unsafeUnwrap()
    // would bake the password into an ordinary container environment variable, where
    // anyone with ecs:DescribeServices could read it.
    const dbHost = config.database.dbInstanceEndpointAddress;
    const dbPort = config.database.dbInstanceEndpointPort;
    // Same constant RDS is created with -- see DATABASE_NAME in backend-stack.ts.
    const dbName = DATABASE_NAME;

    // The ECS *execution* role fetches secrets before the container starts, so the
    // grant belongs there rather than on the infrastructure role.
    config.dbCredentials.grantRead(executionRole);

    const containerPort = config.containerPort ?? 8080;

    // ECS Express Mode service — replaces App Runner
    const service = new CfnExpressGatewayService(this, 'ExpressService', {
      // Unique per environment: a prod deploy must not adopt the dev service.
      serviceName: scopedName('cloudsheets-backend', config.environment),
      executionRoleArn: executionRole.roleArn,
      infrastructureRoleArn: infrastructureRole.roleArn,
      primaryContainer: {
        image: config.imageUri,
        containerPort,
        environment: [
          { name: 'COGNITO_USER_POOL_ID', value: config.cognitoUserPoolId },
          { name: 'COGNITO_CLIENT_ID', value: config.cognitoClientId },
          { name: 'COGNITO_DOMAIN', value: config.cognitoDomain },
          { name: 'DB_HOST', value: dbHost },
          { name: 'DB_PORT', value: dbPort },
          { name: 'DB_NAME', value: dbName },
          // Without NODE_ENV=production, src/db.ts falls back to the knexfile
          // "development" section, which has SSL disabled and fails against RDS.
          { name: 'NODE_ENV', value: 'production' },
          { name: 'DB_SSL', value: 'true' },
          { name: 'PORT', value: String(containerPort) },
          { name: 'FRONTEND_URL', value: config.frontendUrl }
        ],
        // Resolved by the ECS agent from Parameter Store when the task starts, then
        // injected as environment variables into the container only.
        secrets: [
          {
            name: 'DB_USERNAME',
            valueFrom: dbParameterArn(this, config.dbCredentials.usernameParameterName),
          },
          {
            name: 'DB_PASSWORD',
            valueFrom: dbParameterArn(this, config.dbCredentials.passwordParameterName),
          },
        ],
      },
      // Express Mode places its gateway load balancer in exactly these subnets, and
      // the resource has no `scheme` / `internetFacing` property -- the subnets decide.
      // With private subnets the ALB comes up *internal*: the endpoint resolved to
      // 10.0.245.77 / 10.0.172.123 and every request from outside the VPC timed out,
      // including the pipeline's own /health smoke test. The tasks themselves were
      // healthy the whole time, so the symptom looks like a broken container but is not.
      //
      // The security group below applies to the tasks. Express Mode creates its own
      // security group for the gateway, so BackendSG needs no ingress rule.
      networkConfiguration: {
        subnets: config.vpc.publicSubnets.map((subnet: ISubnet) => subnet.subnetId),
        securityGroups: [config.backendSecurityGroup.securityGroupId],
      },
      cpu: '256',
      memory: '512',
      healthCheckPath: config.healthCheckPath ?? '/health',
    });

    new CfnOutput(this, 'EcsExpressEndpoint', {
      value: service.attrEndpoint,
      description: 'ECS Express Service Endpoint (HTTPS)',
    });

    new CfnOutput(this, 'EcsExpressServiceArn', {
      value: service.attrServiceArn,
      description: 'ECS Express Service ARN',
    });

    this.endpoint = service.attrEndpoint;
  }
}
