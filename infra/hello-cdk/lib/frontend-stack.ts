import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { CfnWebACL } from 'aws-cdk-lib/aws-wafv2';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import * as cr from 'aws-cdk-lib/custom-resources';

export interface FrontendStackConfig {
  bucketName: string;
  environment: 'dev' | 'prod';
  domainName?: string;
  apiUrl: string;
  hostedZone?: HostedZone;
  certificate?: Certificate;
  webAcl?: CfnWebACL;
  userPoolId: string;
  userPoolClientId: string;
  cognitoDomain: string;
  existingCallbackUrls: string[];
}


export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, config: FrontendStackConfig, props?: StackProps) {
    super(scope, id, props);


    //S3 Bucket
    const bucket = new Bucket(
      this, //stack in which Bucket will be deployed
      "S3Bucket", //logical ressource name
      {
        bucketName: config.bucketName,
        publicReadAccess: false,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        versioned: true,
        removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN, //automatically delete bucket when stack is removed for dev
        autoDeleteObjects: config.environment === 'dev', //auto delete for dev stack
      }
    )

    //Create OAC explicitly so it becomes more managable
    const oac = new cloudfront.CfnOriginAccessControl(this, 'CloudSheetsOAC', {
      originAccessControlConfig: {
        name: 'CloudSheetsOAC',
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
      ...(config.domainName && config.certificate ? {
        domainNames: [config.domainName],
        certificate: config.certificate,
      } : {}),
      ...(config.webAcl ? { webAclId: config.webAcl.attrArn } : {}),
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

    if (config.domainName && config.hostedZone) {
      new ARecord(this, 'SiteAliasRecord', {
        zone: config.hostedZone,
        recordName: config.domainName,
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      });
    }


    const baseUrl = config.domainName
      ? `https://${config.domainName}`
      : `https://${distribution.distributionDomainName}`;



    // Nach dem baseUrl-Block, VOR dem BucketDeployment:

    new cr.AwsCustomResource(this, 'SyncCognitoCallbackUrl', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPoolClient',
        parameters: {
          UserPoolId: config.userPoolId,
          ClientId: config.userPoolClientId,
          CallbackURLs: [...config.existingCallbackUrls, baseUrl],
          LogoutURLs: [...config.existingCallbackUrls, baseUrl],
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: ['openid', 'email', 'profile'],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: ['COGNITO'],
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${id}-cognito-callback-sync`),
      },
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPoolClient',
        parameters: {
          UserPoolId: config.userPoolId,
          ClientId: config.userPoolClientId,
          CallbackURLs: [...config.existingCallbackUrls, baseUrl],
          LogoutURLs: [...config.existingCallbackUrls, baseUrl],
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: ['openid', 'email', 'profile'],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: ['COGNITO'],
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${id}-cognito-callback-sync`),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${config.userPoolId}`],
      }),
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../../frontend/dist')),
        s3deploy.Source.jsonData('config.json', {
          authority: `https://cognito-idp.${this.region}.amazonaws.com/${config.userPoolId}`,
          clientId: config.userPoolClientId,
          callbackUrl: baseUrl,
          logoutUrl: baseUrl,
          cognitoDomain: config.cognitoDomain,
          apiUrl: config.apiUrl,
        }),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

  }
}

