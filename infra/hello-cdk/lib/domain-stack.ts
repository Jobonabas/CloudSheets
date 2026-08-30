import { Stack, StackProps, CfnOutput, Fn, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { CfnWebACL, CfnLoggingConfiguration } from 'aws-cdk-lib/aws-wafv2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

export interface DomainStackConfig {
    domainName: string;
    environment: 'dev' | 'prod';
    createCertificate?: boolean;
}

export class DomainStack extends Stack {
    public readonly domainName: string;
    public readonly hostedZone: HostedZone;
    public readonly certificate?: Certificate;
    public readonly webAcl: CfnWebACL;


    constructor(scope: Construct, id: string, config: DomainStackConfig, props?: StackProps) {
        super(scope, id, { ...props, crossRegionReferences: true });
        this.domainName = config.domainName;

        this.hostedZone = new HostedZone(this, 'HostedZone', {
            zoneName: config.domainName,
        });

        new CfnOutput(this, 'NameServers', {
            value: Fn.join(', ', this.hostedZone.hostedZoneNameServers!),
            description: 'Diese 4 Werte bei eu.org unter "Technical information" eintragen'
        })
        if (config.createCertificate) {
            this.certificate = new Certificate(this, 'Certificate', {
                domainName: config.domainName,
                validation: CertificateValidation.fromDns(this.hostedZone),
            });
        }

        const wafLogGroup = new LogGroup(this, 'WafLogGroup', {
            logGroupName: `aws-waf-logs-cloudsheets-${config.environment}`,
            retention: RetentionDays.TWO_WEEKS,
            removalPolicy: config.environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
        });

        this.webAcl = new CfnWebACL(this, 'WebACL', {
            scope: 'CLOUDFRONT',
            defaultAction: { allow: {} },
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: `CloudSheetsWebACL-${config.environment}`,
            },
            rules: [
                {
                    name: 'AWS-AWSManagedRulesCommonRuleSet',
                    priority: 1,
                    overrideAction: { none: {} },
                    statement: {
                        managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' },
                    },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: 'CommonRuleSet',
                    },
                },
                {
                    name: 'AWS-AWSManagedRulesSQLiRuleSet',
                    priority: 2,
                    overrideAction: { none: {} },
                    statement: {
                        managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesSQLiRuleSet' },
                    },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: 'SQLiRuleSet',
                    },
                },
                {
                    name: 'AWS-AWSManagedRulesAmazonIpReputationList',
                    priority: 3,
                    overrideAction: { none: {} },
                    statement: {
                        managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesAmazonIpReputationList' },
                    },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: 'IpReputationList',
                    },
                },
                {
                    name: 'RateLimitRule',
                    priority: 4,
                    action: { block: {} },
                    statement: {
                        rateBasedStatement: { limit: 2000, aggregateKeyType: 'IP' },
                    },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: 'RateLimitRule',
                    },
                },
            ],
        });

        new CfnLoggingConfiguration(this, 'WafLoggingConfig', {
            resourceArn: this.webAcl.attrArn,
            logDestinationConfigs: [wafLogGroup.logGroupArn],
            redactedFields: [
                { singleHeader: { Name: 'authorization' } },
                { singleHeader: { Name: 'cookie' } },
            ],
        });
    }
}