import { SecretValue, Names } from 'aws-cdk-lib';
import {
  CfnSubnetGroup,
  CfnReplicationGroup,
} from 'aws-cdk-lib/aws-elasticache';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { Base } from './base';
import { NoOutboundTrafficSecurityGroup } from './utils/default-security-group';
import { redisConfig } from '../config/config';

export interface RedisProps {
  readonly base: Base;
}

export class Redis extends Construct {
  readonly elasticache_redis: CfnReplicationGroup;
  readonly redisAuth: Secret;
  readonly redisSG: NoOutboundTrafficSecurityGroup;

  constructor(scope: Construct, id: string, props: RedisProps) {
    super(scope, id);

    const { base } = props;

    this.redisSG = new NoOutboundTrafficSecurityGroup(
      this, 'RedisSecurityGroup', { vpc: base.vpc },
    );

    const redisSubnetGroup = new CfnSubnetGroup(this, 'ClusterSubnetGroup', {
      cacheSubnetGroupName: `redis-subnet-group-${Names.uniqueId(scope)}`,
      subnetIds: base.vpc.isolatedSubnets.map(({ subnetId }) => subnetId),
      description: `redis-subnet-group-${Names.uniqueId(scope)}`,
    });

    this.redisAuth = new Secret(this, 'RedisSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: redisConfig.DB_USER }),
        generateStringKey: 'password',
        passwordLength: 128,
        excludePunctuation: true,
      },
    });

    this.elasticache_redis = new CfnReplicationGroup(this, 'Redis', {
      cacheNodeType: 'cache.t4g.micro',
      engine: 'Redis',
      numNodeGroups: 1,
      replicasPerNodeGroup: 1,
      replicationGroupDescription: 'redis cache',
      // engineVersion: '5.0.6', // ARM instance requires minimum Redis for ElastiCache 5.0.6 version.
      securityGroupIds: [this.redisSG.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      transitEncryptionMode: 'required',
      authToken: SecretValue.secretsManager(this.redisAuth.secretArn, {
        jsonField: 'password',
      }).unsafeUnwrap(),
      port: redisConfig.DB_PORT,
    });
    this.elasticache_redis.addDependency(redisSubnetGroup);

    NagSuppressions.addResourceSuppressions(this.redisAuth, [
      {
        id: 'AwsSolutions-SMG4',
        reason: 'Wait until SecretsManager is natively supported.',
      },
    ]);
  }
}
