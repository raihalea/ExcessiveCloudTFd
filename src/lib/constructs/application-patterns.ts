import { Aws, Duration } from 'aws-cdk-lib';
import { PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import { InterfaceVpcEndpoint, Peer, Port, IVpc } from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import {
  Cluster,
  ContainerImage,
  Secret as EcsScret,
  AwsLogDriver,
  CpuArchitecture,
  OperatingSystemFamily,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { Database } from './database';
import { Mail } from './mail';
import { Redis } from './redis';
import { AwsManagedPrefixList } from './utils/aws-managed-prefix-list';
import { CloudFrontKeyPairGenerator } from './utils/cloudfront-keypair-generator';
import { AutoCleanupBucket } from './utils/default-bucket';
import { NoOutboundTrafficSecurityGroup } from './utils/default-security-group';
import { Domain } from './utils/domain';
import { domainConfig, databaseConfig, redisConfig } from '../config/config';


export interface ApplicationPatternsProps {
  readonly vpc: IVpc;
  readonly endpointsForECS: InterfaceVpcEndpoint[];
  readonly smtpEndpoint: InterfaceVpcEndpoint;
  readonly database: Database;
  readonly redis: Redis;
  readonly mail: Mail;
}

export class ApplicationPatterns extends Construct {
  readonly loadBalancedFargateService: ApplicationLoadBalancedFargateService;
  readonly ctfdLogDriver: AwsLogDriver;
  readonly cloudfrontPublicKey: PublicKey;
  readonly contentsBucket: Bucket;

  constructor(scope: Construct, id: string, props: ApplicationPatternsProps) {
    super(scope, id);

    const {
      vpc,
      endpointsForECS,
      smtpEndpoint,
      database,
      redis,
      mail,
    } = props;

    this.contentsBucket = new AutoCleanupBucket(this, 'CTFdBucket');

    const albSecurityGroup = new NoOutboundTrafficSecurityGroup(
      this, 'AlbSecurityGroup', { vpc },
    );

    const ecsSecurityGroup = new NoOutboundTrafficSecurityGroup(
      this, 'EcsSecurityGroup', { vpc },
    );

    const ctfdSecretKey = new Secret(this, 'CtfdSecretKey', {
      generateSecretString: {
        passwordLength: 32,
      },
    });

    const ctfAlbDomain = new Domain(this, 'Domain', {
      hostname: domainConfig.ALB_HOSTNAME,
      domain: domainConfig.DOMAIN_NAME,
    });

    this.ctfdLogDriver = new AwsLogDriver({ streamPrefix: 'Service' });

    const cloudfrontKeyPairGenerator = new CloudFrontKeyPairGenerator(this, 'CloudFrontKeyPair');
    this.cloudfrontPublicKey = cloudfrontKeyPairGenerator.publicKey;
    const cloudfrontPrivateKeyParameter = cloudfrontKeyPairGenerator.privateKeyParameter;

    const cluster = new Cluster(this, 'Cluster', { vpc });

    this.loadBalancedFargateService =
    new ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      cpu: 512,
      taskImageOptions: {
        image: ContainerImage.fromAsset('./CTFd', {
          platform: Platform.LINUX_ARM64,
        }),
        environment: {
          WORKERS: '3',
          // UPLOAD_PROVIDER: 's3',
          UPLOAD_PROVIDER: 's3withcf',
          AWS_S3_BUCKET: `${this.contentsBucket.bucketName}`,
          AWS_S3_REGION: `${Aws.REGION}`,
          AWS_S3_CUSTOM_DOMAIN: `${domainConfig.HOSTNAME}.${domainConfig.DOMAIN_NAME}`,
          AWS_S3_CUSTOM_PREFIX: 'files/s3/',
          AWS_CF_PUBLIC_KEY_ID: this.cloudfrontPublicKey.publicKeyId,
          DATABASE_USER: database.DB_USERNAME,
          DATABASE_HOST: database.dbCluster.clusterEndpoint.hostname,
          // DATABASE_HOST: database.dbCluster.dbInstanceEndpointAddress,
          DATABASE_PORT: String(database.dbCluster.clusterEndpoint.port),
          // DATABASE_PORT: database.dbCluster.dbInstanceEndpointPort,
          REDIS_PROTOCOL: 'rediss',
          REDIS_HOST: redis.elasticache_redis.attrPrimaryEndPointAddress,
          MAILFROM_ADDR: `ctfd@${domainConfig.DOMAIN_NAME}`,
          MAIL_SERVER: `email-smtp.${Aws.REGION}.amazonaws.com`,
          MAIL_PORT: '587',
          MAIL_USEAUTH: 'true',
          MAIL_USERNAME: mail.smtpAccessKey.accessKeyId,
          MAIL_TLS: 'true',
          ACCESS_LOG: '-',
          ERROR_LOG: '-',
          REVERSE_PROXY: '2,2,2,2,2',
        },
        secrets: {
          SECRET_KEY: EcsScret.fromSecretsManager( ctfdSecretKey ),
          AWS_CF_PRIVATE_KEY: EcsScret.fromSsmParameter(cloudfrontPrivateKeyParameter),
          DATABASE_PASSWORD: EcsScret.fromSecretsManager( database.dbCluster.secret!, 'password'),
          REDIS_PASSWORD: EcsScret.fromSecretsManager( redis.redisAuth, 'password' ),
          MAIL_PASSWORD: EcsScret.fromSecretsManager( mail.smtpSecretAccessKey, 'smtpSecret' ),
        },
        containerPort: 8000,
        logDriver: this.ctfdLogDriver,
      },
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      // enableExecuteCommand: true,
      openListener: false,
      listenerPort: 443,
      domainName: ctfAlbDomain.fqdn,
      domainZone: ctfAlbDomain.hostedZone,
      certificate: ctfAlbDomain.certificate,
      securityGroups: [ecsSecurityGroup],
    });

    this.contentsBucket.grantReadWrite(
      this.loadBalancedFargateService.service.taskDefinition.taskRole,
    );

    this.loadBalancedFargateService.targetGroup.configureHealthCheck({
      path: '/healthcheck',
    });

    const scalableTarget =
      this.loadBalancedFargateService.service.autoScaleTaskCount({
        maxCapacity: 5,
        minCapacity: 1,
      });

    scalableTarget.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 700,
      targetGroup: this.loadBalancedFargateService.targetGroup,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 75,
      scaleInCooldown: Duration.minutes(10),
    });

    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 75,
      scaleInCooldown: Duration.minutes(10),
    });

    this.loadBalancedFargateService.service.node.addDependency(
      redis.elasticache_redis,
    );

    endpointsForECS.forEach((endpoint) => {
      endpoint.connections.allowFrom(ecsSecurityGroup, Port.tcp(443));
    });

    smtpEndpoint.connections.allowFrom(ecsSecurityGroup, Port.tcp(587));

    const s3PrefixList = new AwsManagedPrefixList( this, 'S3PrefixList',
      { name: `com.amazonaws.${Aws.REGION}.s3` },
    ).prefixList;

    ecsSecurityGroup.addEgressRule(
      Peer.prefixList(s3PrefixList.prefixListId),
      Port.tcp(443),
    );

    database.dbCluster.connections.allowFrom(
      this.loadBalancedFargateService.service,
      Port.tcp(databaseConfig.DB_PORT),
      'Allow inbound DB connection',
    );

    redis.redisSG.connections.allowFrom(
      this.loadBalancedFargateService.service,
      Port.tcp(redisConfig.DB_PORT),
      'Allow inbound Redis connection',
    );

    const cloudfrontPrefixList = new AwsManagedPrefixList(
      this,
      'CloudfrontOriginPrefixList',
      { name: 'com.amazonaws.global.cloudfront.origin-facing' },
    ).prefixList;

    albSecurityGroup.addIngressRule(
      Peer.prefixList(cloudfrontPrefixList.prefixListId),
      Port.tcp(443),
    );

    this.loadBalancedFargateService.loadBalancer.addSecurityGroup(
      albSecurityGroup,
    );
  }
}
