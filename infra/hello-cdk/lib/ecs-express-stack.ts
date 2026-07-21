import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnExpressGatewayService } from 'aws-cdk-lib/aws-ecs';
import { Role, ServicePrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';

interface EcsExpressStackConfig {
  environment: "dev" | "prod";
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoDomain: string;
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

    // ECS Express Mode service — replaces App Runner
    const service = new CfnExpressGatewayService(this, 'ExpressService', {
      serviceName: 'cloudsheets-hello-world',
      executionRoleArn: executionRole.roleArn,
      infrastructureRoleArn: infrastructureRole.roleArn,
      primaryContainer: {
        image: 'public.ecr.aws/docker/library/nginx:latest',
        containerPort: 80,
        environment: [
          { name: 'COGNITO_USER_POOL_ID', value: config.cognitoUserPoolId },
          { name: 'COGNITO_CLIENT_ID', value: config.cognitoClientId },
          { name: 'COGNITO_DOMAIN', value: config.cognitoDomain },
        ],
      },
      cpu: '256',
      memory: '512',
      healthCheckPath: '/',
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
