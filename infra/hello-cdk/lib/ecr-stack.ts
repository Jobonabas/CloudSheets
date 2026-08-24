import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Repository, TagMutability, TagStatus } from 'aws-cdk-lib/aws-ecr';
import { EnvironmentName } from './environment';

interface EcrStackConfig {
  /** Repository name for this environment -- see lib/environments.json. */
  repositoryName: string;
  environment: EnvironmentName;
}

export class EcrStack extends Stack {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string, config: EcrStackConfig, props?: StackProps) {
    super(scope, id, props);

    this.repository = new Repository(this, 'EcrRepository', {
      repositoryName: config.repositoryName,
      imageTagMutability: TagMutability.MUTABLE,
      imageScanOnPush: true,
      removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      emptyOnDelete: config.environment === 'dev',
      lifecycleRules: [
        {
          description: 'Keep only the last 10 tagged images',
          maxImageCount: 10,
          tagStatus: TagStatus.TAGGED,
          tagPatternList: ['*'],
        },
        {
          description: 'Remove untagged images after 7 days',
          maxImageAge: Duration.days(7),
          tagStatus: TagStatus.UNTAGGED,
        },
      ],
    });
  }
}
