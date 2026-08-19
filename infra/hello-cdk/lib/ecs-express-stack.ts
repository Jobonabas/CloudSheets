import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnExpressGatewayService } from 'aws-cdk-lib/aws-ecs';
import { Role, ServicePrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { Vpc, ISecurityGroup, ISubnet } from 'aws-cdk-lib/aws-ec2';
import { DbCredentialsToSsm, dbParameterArn } from './db-credentials-parameter';

export interface EcsExpressStackConfig {
  environment: "dev" | "prod";
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
}

export class EcsExpressStack extends Stack {

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
    const dbName = 'cloudsheet';

    // The ECS *execution* role fetches secrets before the container starts, so the
    // grant belongs there rather than on the infrastructure role.
    config.dbCredentials.grantRead(executionRole);

    const containerPort = config.containerPort ?? 8080;

    // ECS Express Mode service — replaces App Runner
    const service = new CfnExpressGatewayService(this, 'ExpressService', {
      serviceName: 'cloudsheets-backend',
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
          { name: 'PORT', value: String(containerPort) }
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
      networkConfiguration: {
        subnets: config.vpc.privateSubnets.map((subnet: ISubnet) => subnet.subnetId),
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
  }
}
