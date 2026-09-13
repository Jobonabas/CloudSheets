import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
    Dashboard,
    GraphWidget,
    TextWidget,
    Metric,
    Alarm,
    AlarmWidget,
    ComparisonOperator,
    TreatMissingData
} from 'aws-cdk-lib/aws-cloudwatch';
import {Construct } from 'constructs';
import { EnvironmentName, scopedName } from './environment';
import { DistributedMap } from 'aws-cdk-lib/aws-stepfunctions';

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

    //Metrics to reuse:
    const ecsCpuMetric = new Metric({
    namespace: 'AWS/ECS',
    metricName: 'CPUUtilization',
    dimensionsMap: {
        ServiceName: config.serviceName,
    },
    statistic: 'Average',
    period: Duration.minutes(5),
    });

    const rdsConnectionsMetric = new Metric({
    namespace: 'AWS/RDS',
    metricName: 'DatabaseConnections',
    dimensionsMap: {
        DBInstanceIdentifier: config.dbInstanceIdentifier,
    },
    statistic: 'Average',
    period: Duration.minutes(5),
    });

    const cloudFrontRequestsMetric = new Metric({
    namespace: 'AWS/CloudFront',
    metricName: 'Requests',
    dimensionsMap: {
        DistributionId: config.distributionId,
    },
    statistic: 'Sum',
    period: Duration.minutes(5),
    });

    const cloudfrontErrorRate = new Metric({
        namespace: 'AWS/CloudFront',
        metricName: '5xxErrorRate', //amount 5xx errors
        dimensionsMap: { DistributionId: config.distributionId },
        statistic: 'Average',
        period: Duration.minutes(5)
    })

    // ECS Dashboard 
    dashboard.addWidgets(
        new TextWidget({ markdown: '## ECS Service' }),
        new GraphWidget({
            title: 'CPU Utilization',
            width: 12,
            left: [ecsCpuMetric],
        }),
    );
    // RDS Dashboard (Database)
    dashboard.addWidgets(
        new TextWidget({ markdown: '## RDS Database' }),
        new GraphWidget({
            title: 'Database Connections',
            width: 12,
            left: [rdsConnectionsMetric],
        }),
    );
    //CloudFront Dashboard
    dashboard.addWidgets(
        new TextWidget({ markdown: '## Cloudfront' }),
        new GraphWidget({
            title: 'Requests',
            width: 12,
            left: [cloudFrontRequestsMetric],
        }),
    );

    // Alarms
    const ecsCpuAlarm = new Alarm(this, 'EcsCpuHighAlarm', {
        metric: ecsCpuMetric,
        threshold: 80, //trigger when CPU above 80% for 2 periods
        evaluationPeriods: 2,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING, //no alarm when metric/data missing
        alarmDescription: 'ECS Backend CPU High!!'
    })
    dashboard.addWidgets(
        new AlarmWidget({alarm: ecsCpuAlarm, height: 3, width: 12})
    )

    const rdsConnectionAlarm = new Alarm(this, 'RdsConnectionsHighAlarm', {
        metric: rdsConnectionsMetric,
        threshold: 22, //simultanious Connections 
        evaluationPeriods: 2,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        alarmDescription: 'RDS connections high',
    })
    dashboard.addWidgets(
        new AlarmWidget({alarm: rdsConnectionAlarm, height: 3, width: 12})
    )

const cloudFront5xxAlarm = new Alarm(this, 'CloudFront5xxAlarm', {
    metric: cloudfrontErrorRate,
    threshold: 8,
    evaluationPeriods: 2,
    comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
    alarmDescription: 'many CloudFront 5xx errors'
    });
    dashboard.addWidgets(
        new AlarmWidget({alarm: cloudFront5xxAlarm, height: 3, width: 12})
    )
    }
}