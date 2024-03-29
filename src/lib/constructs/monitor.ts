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

    // const info = new Topic(this, 'Info');
    const notice = new Topic(this, 'Notice');
    const warn = new Topic(this, 'Warn');
    const cretical = new Topic(this, 'Cretical');

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

    const mfInfo = new MetricFilter(this, 'mfInfo', {
      logGroup: ctfd.ctfdLogDriver.logGroup!,
      metricNamespace: 'CTFd/ECS/task/INFO',
      metricName: 'INFO',
      filterPattern: FilterPattern.anyTerm('INFO'),
    });

    const mfWARNING = new MetricFilter(this, 'mfWARNING', {
      logGroup: ctfd.ctfdLogDriver.logGroup!,
      metricNamespace: 'CTFd/ECS/task/WARNING',
      metricName: 'WARNING',
      filterPattern: FilterPattern.anyTerm('WARNING'),
    });

    const mfError = new MetricFilter(this, 'mfERROR', {
      logGroup: ctfd.ctfdLogDriver.logGroup!,
      metricNamespace: 'CTFd/ECS/task/ERROR',
      metricName: 'ERROR',
      filterPattern: FilterPattern.anyTerm('ERROR'),
    });

    const mfCRITICALL = new MetricFilter(this, 'mfCRITICAL', {
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
        { title: 'Warning', metrics: [mfWARNING.metric()] },
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
              metric: mfCRITICALL.metric(),
              alarmFriendlyName: 'CTFd Critical',
              addAlarm: {
                Critical: {
                  threshold: 1,
                  comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
                  actionOverride: new SnsAlarmActionStrategy({
                    onAlarmTopic: cretical,
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
    // .addMediumHeader("Waf")
    // .monitorWebApplicationFirewallAclV2({acl: waf.wafAclCloudFront})
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
                    onAlarmTopic: cretical,
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
                    onAlarmTopic: cretical,
                  }),
                },
              },
              position: AxisPosition.RIGHT,
            },
          ],
        },
      ],
    });
  }
}
