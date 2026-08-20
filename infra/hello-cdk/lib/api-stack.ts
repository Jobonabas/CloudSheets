import { Stack, StackProps, CfnOutput, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { CfnWebACL } from 'aws-cdk-lib/aws-wafv2';

export interface ApiStackConfig {
    environment: 'dev' | 'prod';
    apiDomainName: string;
    hostedZone: HostedZone;
    backendEndpoint: string;
    webAcl: CfnWebACL;
}

export class ApiStack extends Stack {
    constructor(scope: Construct, id: string, config: ApiStackConfig, props?: StackProps) {
        super(scope, id, { ...props, crossRegionReferences: true });
        const backendHost = Fn.select(2, Fn.split('/', config.backendEndpoint));
        const certificate = new Certificate(this, 'ApiCertificate', {
            domainName: config.apiDomainName,
            validation: CertificateValidation.fromDns(config.hostedZone),
        });

        const distribution = new cloudfront.Distribution(this, 'ApiDistribution', {
            defaultBehavior: {
                origin: new origins.HttpOrigin(backendHost, {
                    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
            },
            domainNames: [config.apiDomainName],
            certificate,
            webAclId: config.webAcl.attrArn,
        });

        new ARecord(this, 'ApiAliasRecord', {
            zone: config.hostedZone,
            recordName: config.apiDomainName,
            target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        });

        new CfnOutput(this, 'ApiUrl', { value: `https://${config.apiDomainName}` });
    }
}