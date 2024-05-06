import { Duration } from 'aws-cdk-lib';
import { Metric, Stats, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { MetricFilter, FilterPattern } from 'aws-cdk-lib/aws-logs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import {
  MonitoringFacade,
  ElastiCacheClusterType,
  SnsAlarmActionStrategy,
  AxisPosition,
} from 'cdk-monitoring-constructs';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

import { ApplicationPatterns } from './application-patterns';
import { Database } from './database';
import { Mail } from './mail';
import { Redis } from './redis';

export interface MonitorProps {
  readonly database: Database;
  readonly redis: Redis;
  readonly mail: Mail;
  readonly ctfd: ApplicationPatterns;
}

export class Monitor extends Construct {
  constructor(scope: Construct, id: string, props: MonitorProps) {
    super(scope, id);

    const { database, redis, mail, ctfd } = props;

    // const info = new Topic(this, 'Info', { enforceSSL: true });
    const notice = new Topic(this, 'Notice', { enforceSSL: true });
    const warn = new Topic(this, 'Warn', { enforceSSL: true });
    const critical = new Topic(this, 'Critical', { enforceSSL: true });

    const monitoring = new MonitoringFacade(this, 'CTFdMonitor');

    monitoring.addLargeHeader('CTFd');
    monitoring.monitorFargateApplicationLoadBalancer({
      applicationLoadBalancer: ctfd.loadBalancedFargateService.loadBalancer,
      applicationTargetGroup: ctfd.loadBalancedFargateService.targetGroup,
      fargateService: ctfd.loadBalancedFargateService.service,
      addMemoryUsageAlarm: {
        Warning: {
          maxUsagePercent: 90,
          actionOverride: new SnsAlarmActionStrategy({ onAlarmTopic: notice }),
        },
      },
      addHealthyTaskCountAlarm: {
        Warning: {
          minHealthyTasks: 0,
          actionOverride: new SnsAlarmActionStrategy({ onAlarmTopic: notice }),
        },
      },
      addRunningTaskCountAlarm: {
        Warning: {
          maxRunningTasks: 5,
          actionOverride: new SnsAlarmActionStrategy({ onAlarmTopic: notice }),
        },
      },
    });

    const mfInfo = new MetricFilter(this, 'MfInfo', {
      logGroup: ctfd.ctfdLogDriver.logGroup!,
      metricNamespace: 'CTFd/ECS/task/INFO',
      metricName: 'INFO',
      filterPattern: FilterPattern.anyTerm('INFO'),
    });

    const mfWarning = new MetricFilter(this, 'MfWarning', {
      logGroup: ctfd.ctfdLogDriver.logGroup!,
      metricNamespace: 'CTFd/ECS/task/WARNING',
      metricName: 'WARNING',
      filterPattern: FilterPattern.anyTerm('WARNING'),
    });

    const mfError = new MetricFilter(this, 'MfError', {
      logGroup: ctfd.ctfdLogDriver.logGroup!,
      metricNamespace: 'CTFd/ECS/task/ERROR',
      metricName: 'ERROR',
      filterPattern: FilterPattern.anyTerm('ERROR'),
    });

    const mfCritical = new MetricFilter(this, 'MfCritical', {
      logGroup: ctfd.ctfdLogDriver.logGroup!,
      metricNamespace: 'CTFd/ECS/task/CRITICAL',
      metricName: 'CRITICAL',
      filterPattern: FilterPattern.anyTerm('CRITICAL'),
    });

    monitoring.monitorCustom({
      humanReadableName: 'CTFd Logs',
      alarmFriendlyName: 'CTFd Log',
      metricGroups: [
        { title: 'Info', metrics: [mfInfo.metric()] },
        { title: 'Warning', metrics: [mfWarning.metric()] },
        {
          title: 'Error',
          metrics: [
            {
              metric: mfError.metric(),
              alarmFriendlyName: 'CTFd Error',
              addAlarm: {
                Warning: {
                  threshold: 1,
                  comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
                  actionOverride: new SnsAlarmActionStrategy({
                    onAlarmTopic: warn,
                  }),
                  datapointsToAlarm: 1,
                },
              },
            },
          ],
        },
        {
          title: 'Critical',
          metrics: [
            {
              metric: mfCritical.metric(),
              alarmFriendlyName: 'CTFd Critical',
              addAlarm: {
                Critical: {
                  threshold: 1,
                  comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
                  actionOverride: new SnsAlarmActionStrategy({
                    onAlarmTopic: critical,
                  }),
                  datapointsToAlarm: 1,
                },
              },
            },
          ],
        },
      ],
    });

    // monitoring.monitorCloudFrontDistribution({
    //   distribution: cdn.distribution,
    // });
    monitoring.monitorRdsCluster({
      cluster: database.dbCluster,
      addCpuUsageAlarm: {
        Warning: {
          maxUsagePercent: 80,
          actionOverride: new SnsAlarmActionStrategy({ onAlarmTopic: notice }),
        },
      },
    });

    const m1 = database.dbCluster.metricACUUtilization();
    const m2 = database.dbCluster.metricCPUUtilization();
    const m3 = database.dbCluster.metricServerlessDatabaseCapacity();
    const m4 = database.dbCluster.metricNetworkThroughput();
    const m5 = database.dbCluster.metricNetworkReceiveThroughput();
    const m6 = database.dbCluster.metricNetworkTransmitThroughput();
    monitoring.monitorCustom({
      humanReadableName: 'Aurora Serverless v2',
      alarmFriendlyName: 'AuroraServerlessv2',
      metricGroups: [
        { title: 'ACUUtilization', metrics: [m1] },
        { title: 'CPUUtilization', metrics: [m2] },
        { title: 'DatabaseCapacity', metrics: [m3] },
        { title: 'NetworkThroughput', metrics: [m4, m5, m6] },
      ],
    });

    monitoring.monitorElastiCacheCluster({
      clusterType: ElastiCacheClusterType.REDIS,
      clusterId: redis.elasticache_redis.replicationGroupId,
    });

    const metricSend = new Metric({
      namespace: 'AWS/SES',
      metricName: 'Send',
      statistic: Stats.SUM,
      period: Duration.minutes(5),
      dimensionsMap: {
        [mail.cloudWatchDimension.name]: mail.cloudWatchDimension.defaultValue,
      },
    });

    const metricDelivery = new Metric({
      namespace: 'AWS/SES',
      metricName: 'Delivery',
      statistic: Stats.SUM,
      period: Duration.minutes(5),
      dimensionsMap: {
        [mail.cloudWatchDimension.name]: mail.cloudWatchDimension.defaultValue,
      },
    });

    const metricComplaint = new Metric({
      namespace: 'AWS/SES',
      metricName: 'Complaint',
      statistic: Stats.SUM,
      period: Duration.minutes(5),
      dimensionsMap: {
        [mail.cloudWatchDimension.name]: mail.cloudWatchDimension.defaultValue,
      },
    });

    const metricComplaintRate = new Metric({
      namespace: 'AWS/SES',
      metricName: 'Reputation.ComplaintRate',
      statistic: Stats.AVERAGE,
      period: Duration.minutes(5),
      dimensionsMap: {
        'ses:configuration-set': mail.configurationSet.configurationSetName,
      },
    });

    const metricBounce = new Metric({
      namespace: 'AWS/SES',
      metricName: 'Bounce',
      statistic: Stats.SUM,
      period: Duration.minutes(5),
      dimensionsMap: {
        [mail.cloudWatchDimension.name]: mail.cloudWatchDimension.defaultValue,
      },
    });

    const metricBounceRate = new Metric({
      namespace: 'AWS/SES',
      metricName: 'Reputation.BounceRate',
      statistic: Stats.AVERAGE,
      period: Duration.minutes(5),
      dimensionsMap: {
        'ses:configuration-set': mail.configurationSet.configurationSetName,
      },
    });

    monitoring.monitorCustom({
      humanReadableName: 'SES Mail',
      alarmFriendlyName: 'SESMail',
      metricGroups: [
        {
          title: 'Mail Stats',
          metrics: [metricSend, metricDelivery],
        },
        {
          title: 'Complaint',
          metrics: [
            metricComplaint,
            {
              metric: metricComplaintRate,
              alarmFriendlyName: 'ComplaintRate',
              addAlarm: {
                Critical: {
                  threshold: 0.1,
                  comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
                  actionOverride: new SnsAlarmActionStrategy({
                    onAlarmTopic: critical,
                  }),
                },
              },
              position: AxisPosition.RIGHT,
            },
          ],
        },
        {
          title: 'Bounce',
          metrics: [
            metricBounce,
            {
              metric: metricBounceRate,
              alarmFriendlyName: 'BounceRate',
              addAlarm: {
                Critical: {
                  threshold: 5,
                  comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
                  actionOverride: new SnsAlarmActionStrategy({
                    onAlarmTopic: critical,
                  }),
                },
              },
              position: AxisPosition.RIGHT,
            },
          ],
        },
      ],
    });

    NagSuppressions.addResourceSuppressions(
      [notice, warn, critical],
      [
        {
          id: 'AwsSolutions-SNS2',
          reason: 'It would be better to support it. Use customer-managed KMS for inter-service messaging.',
        },
        {
          id: 'AwsSolutions-SNS3',
          reason: 'use enforceSSL',
        },
      ],
    );
  }
}
