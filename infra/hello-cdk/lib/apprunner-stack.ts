import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnService } from 'aws-cdk-lib/aws-apprunner';

export class AppRunnerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const service = new CfnService(this, 'AppRunnerService', {
      serviceName: 'cloudsheets-hello-world',
      sourceConfiguration: {
        imageRepository: {
          imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
          imageRepositoryType: 'ECR_PUBLIC',
          imageConfiguration: {
            port: '8000',
          },
        },
        autoDeploymentsEnabled: false,
      },
      instanceConfiguration: {
        cpu: '256',
        memory: '512',
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });

    new CfnOutput(this, 'AppRunnerUrl', {
      value: `https://${service.attrServiceUrl}`,
      description: 'App Runner Service URL (HTTPS)',
    });
  }
}
