import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess, IBucket } from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { EnvironmentName, scopedName } from './environment';

export interface FrontendStackConfig {
  /** Globally unique bucket name -- derived from the environment in bin/hello-cdk.ts. */
  bucketName: string;
  environment: EnvironmentName;

}


export class FrontendStack extends Stack {
  /**
   * Public URL of the deployed frontend. Handed to EcsExpressStack as the CORS
   * origin. Safe direction: EcsExpressStack already depends on this stack for the
   * Cognito values, so no cross-stack cycle is introduced.
   */
  public readonly appUrl: string;
  public readonly bucket: IBucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, config: FrontendStackConfig, props?: StackProps) {
    super(scope, id, props);

    //S3 Bucket
    const bucket = new Bucket(
      this, //stack in which Bucket will be deployed
      "S3Bucket", //logical ressource name
      {
        bucketName: config.bucketName, //globally unique, so dev and prod cannot share one
        publicReadAccess: false,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        versioned: true,
        removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN, //automatically delete bucket when stack is removed for dev
        autoDeleteObjects: config.environment === 'dev', //auto delete for dev stack
      }
    )

    //Create OAC explicitly so it becomes more managable
    // The OAC name has to be unique per account, so it carries the environment too.
    const oac = new cloudfront.CfnOriginAccessControl(this, 'CloudSheetsOAC', {
      originAccessControlConfig: {
        name: scopedName('CloudSheetsOAC', config.environment),
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    });


    const distribution = new cloudfront.Distribution(this, 'CloudSheetsDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket, {
          originAccessControlId: oac.attrId,  // <-- eigenen OAC injizieren
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    this.distributionId = distribution.distributionId;

    new CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`
    });

    this.appUrl = `https://${distribution.distributionDomainName}`;
    this.bucket = bucket;
    this.distribution = distribution;

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../frontend/dist'))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
    });
  }
}
