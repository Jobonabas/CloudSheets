import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Mfa, OAuthScope, UserPool, UserPoolClient, UserPoolClientIdentityProvider} from 'aws-cdk-lib/aws-cognito'
import * as cr from 'aws-cdk-lib/custom-resources';

export interface FrontendStackConfig {
  bucketName: string;
  environment: 'dev' | 'prod';
}
/*
interface CognitoConfig {
  userPoolId: string;
  userPoolClientId: string;
  cognitoDomainUrl: string;
  authority: string;
  clientId: string;
}*/

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, config: FrontendStackConfig, props?: StackProps) {
    super(scope, id, props);
      
    //S3 Bucket
    const bucket = new Bucket(
      this, //stack in which Bucket will be deployed
      "S3Bucket", //logical ressource name
      {
        bucketName: "cloudsheets-frontend-bucket",
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

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../frontend/dist'))], //Path to frontend deployment files
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'CloudFrontUrl', {
        value: `https://${distribution.distributionDomainName}`});
    
    const baseUrl = `https://${distribution.distributionDomainName}`;

   

    const userPool = new UserPool(this, 'FrontendUserPool', {
        userPoolName: 'cloudsheets-user-pool',
        selfSignUpEnabled: true,
        signInAliases:{
          email: true
        },
        autoVerify: {email: true},
        passwordPolicy: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        mfa: Mfa.REQUIRED,
        mfaSecondFactor: {
          sms: false,
          otp: true
        },
        removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      });

      const providerDomain = userPool.addDomain('CognitoDomain', {
        cognitoDomain: {
            domainPrefix: `cloudsheets-auth-${config.environment}`,
        },
      });

      
      const userPoolClient = new UserPoolClient(this, 'FrontendUserPoolClient', {
        userPool,
        supportedIdentityProviders: [
          UserPoolClientIdentityProvider.COGNITO,
        ],
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
          },
          scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
          callbackUrls: [baseUrl],
          logoutUrls: [baseUrl]
        },
      });

      new CfnOutput(this, 'UserPoolId', {
        value: userPool.userPoolId
      });
      
      new CfnOutput(this, 'UserPoolClientId', {
        value: userPoolClient.userPoolClientId,
      });
      new CfnOutput(this, 'CognitoDomainUrl', {
        value: providerDomain.baseUrl(),
      });

      
       new cr.AwsCustomResource(this, 'WriteConfig', {
  onUpdate: {
    service: 'S3',
    action: 'putObject',
    parameters: {
      Bucket: bucket.bucketName,
      Key: 'config.json',
      Body: JSON.stringify({
        authority: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
        clientId: userPoolClient.userPoolClientId,
        callbackUrl: baseUrl,
        logoutUrl: baseUrl,
        cognitoDomain: providerDomain.baseUrl(),
      }),
      ContentType: 'application/json',
    },
    physicalResourceId: cr.PhysicalResourceId.of('config-json'),
  },
  policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
    resources: [bucket.bucketArn + '/*'],
  }),
});
}
}

/*cognitoConfig, 
        callbackUrl: baseUrl, 
        logoutUrl: baseUrl, */