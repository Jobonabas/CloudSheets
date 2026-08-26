import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Mfa, OAuthScope, UserPool, UserPoolClient, UserPoolClientIdentityProvider} from 'aws-cdk-lib/aws-cognito'
import * as cr from 'aws-cdk-lib/custom-resources';
import { EnvironmentName, scopedName } from './environment';

export interface FrontendStackConfig {
  /** Globally unique bucket name -- derived from the environment in bin/hello-cdk.ts. */
  bucketName: string;
  environment: EnvironmentName;
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
  /**
   * Public URL of the deployed frontend. Handed to EcsExpressStack as the CORS
   * origin. Safe direction: EcsExpressStack already depends on this stack for the
   * Cognito values, so no cross-stack cycle is introduced.
   */
  public readonly appUrl: string;
  public readonly userPoolId: string;
  public readonly userPoolClientId: string;
  public readonly cognitoDomain: string;

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

    new CfnOutput(this, 'CloudFrontUrl', {
        value: `https://${distribution.distributionDomainName}`});
    
    const baseUrl = `https://${distribution.distributionDomainName}`;
    this.appUrl = baseUrl;

   

    const userPool = new UserPool(this, 'FrontendUserPool', {
        userPoolName: scopedName('cloudsheets-user-pool', config.environment),
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

      this.userPoolId = userPool.userPoolId;
      this.userPoolClientId = userPoolClient.userPoolClientId;
      this.cognitoDomain = providerDomain.baseUrl();

      new CfnOutput(this, 'UserPoolId', {
        value: this.userPoolId
      });
      
      new CfnOutput(this, 'UserPoolClientId', {
        value: this.userPoolClientId,
      });
      new CfnOutput(this, 'CognitoDomainUrl', {
        value: this.cognitoDomain
      });

      
       new s3deploy.BucketDeployment(this, 'DeployFrontend', {
  sources: [
    s3deploy.Source.asset(path.join(__dirname, '../../../frontend/dist')),
    s3deploy.Source.jsonData('config.json', {  // ← direkt hier!
      authority: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`,
      clientId: this.userPoolClientId,
      callbackUrl: baseUrl,
      logoutUrl: baseUrl,
      cognitoDomain: this.cognitoDomain,
    }),
  ],
  destinationBucket: bucket,
  distribution,
  distributionPaths: ['/*'],
});
}
}

/*cognitoConfig, 
        callbackUrl: baseUrl, 
        logoutUrl: baseUrl, */