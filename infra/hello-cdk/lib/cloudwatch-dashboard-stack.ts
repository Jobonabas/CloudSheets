import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
    Dashboard,
    GraphWidget,
    TextWidget,
    Metric,
} from 'aws-cdk-lib/aws-cloudwatch';
import {Construct } from 'constructs';
import { EnvironmentName, scopedName } from './environment';

export interface DashboardStackConfig {
  environment: EnvironmentName;
  serviceName: string,
  dbInstanceIdentifier: string;
  distributionId: string;
}

export class CloudWatchDashboardStack extends Stack {
    constructor(scope: Construct, id: string, config: DashboardStackConfig, props?: StackProps) {
        super(scope, id, props);
    
    const dashboard = new Dashboard(this, 'CloudSheetsDashboard', {
        dashboardName: scopedName('cloudsheets-dashboard', config.environment),
    });

    // ECS Dashboard 
    dashboard.addWidgets(
        new TextWidget({ markdown: '## ECS Service' }),
        new GraphWidget({
            title: 'CPU Utilization',
            width: 12,
            left: [
                new Metric({
                    namespace: 'AWS/ECS',
                    metricName: 'CPUUtilization',
                    dimensionsMap: {
                        ServiceName: config.serviceName,
                    },
                    statistic: 'Average',
                    period: Duration.minutes(5), //aggregate data into 5 minute buckets for average
                }),
            ],
        }),
    );
    // RDS Dashboard (Database)
    dashboard.addWidgets(
        new TextWidget({ markdown: '## RDS Database' }),
        new GraphWidget({
            title: 'Database Connections',
            width: 12,
            left: [
                new Metric({
                    namespace: 'AWS/RDS',
                    metricName: 'DatabaseConnections',
                    dimensionsMap: {
                        DBInstanceIdentifier: config.dbInstanceIdentifier
                    },
                    statistic: 'Average',
                    period: Duration.minutes(5),
                }),
            ],
        }),
    );
    //CloudFront Dashboard
    dashboard.addWidgets(
        new TextWidget({ markdown: '## Cloudfront' }),
        new GraphWidget({
            title: 'Requests',
            width: 12,
            left: [
                new Metric({
                    namespace: 'AWS/CloudFront',
                    metricName: 'Requests',
                    dimensionsMap: {
                        DistributionId: config.distributionId,
                    },
                    statistic: 'Sum',
                    period: Duration.minutes(5),
                    region: 'us-east-1',
                }),
            ],
        }),
    );
    }
}