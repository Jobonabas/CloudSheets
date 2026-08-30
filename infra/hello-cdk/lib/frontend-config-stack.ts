import { Stack, StackProps } from 'aws-cdk-lib';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface FrontendConfigStackConfig {
    frontendBucket: IBucket;
    frontendDistribution: cloudfront.Distribution;
    userPoolId: string;
    userPoolClientId: string;
    cognitoDomain: string;
    callbackUrl: string;
    apiUrl: string;
}

export class FrontendConfigStack extends Stack {
    constructor(scope: Construct, id: string, config: FrontendConfigStackConfig, props?: StackProps) {
        super(scope, id, props);

        new s3deploy.BucketDeployment(this, 'DeployFrontendConfig', {
            sources: [
                s3deploy.Source.jsonData('config.json', {
                    authority: `https://cognito-idp.${this.region}.amazonaws.com/${config.userPoolId}`,
                    clientId: config.userPoolClientId,
                    callbackUrl: config.callbackUrl,
                    logoutUrl: config.callbackUrl,
                    cognitoDomain: config.cognitoDomain,
                    apiUrl: config.apiUrl,
                }),
            ],
            destinationBucket: config.frontendBucket,
            distribution: config.frontendDistribution,
            distributionPaths: ['/config.json'],
            prune: false,
        });
    }
}