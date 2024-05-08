import { Names } from 'aws-cdk-lib';
import { SubnetType, Port } from 'aws-cdk-lib/aws-ec2';
import {
  DatabaseCluster,
  DatabaseClusterEngine,
  AuroraMysqlEngineVersion,
  Credentials,
  ClusterInstance,
  CaCertificate,
} from 'aws-cdk-lib/aws-rds';
import { HostedRotation } from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { Base } from './base';
import { NoOutboundTrafficSecurityGroup } from './utils/default-security-group';
import { databaseConfig } from '../config/config';

export interface DatabaseProps {
  readonly base: Base;
}

export class Database extends Construct {
  readonly DB_USERNAME: string;
  readonly dbCluster: DatabaseCluster;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const { base } = props;

    this.DB_USERNAME = databaseConfig.DB_USER;

    const dbClusterSecurityGroup = new NoOutboundTrafficSecurityGroup(
      this, 'DbSecurityGroup', { vpc: base.vpc },
    );

    this.dbCluster = new DatabaseCluster(this, 'Db', {
      engine: DatabaseClusterEngine.auroraMysql({
        version: AuroraMysqlEngineVersion.VER_3_04_0,
      }),
      credentials: Credentials.fromGeneratedSecret(this.DB_USERNAME),
      writer: ClusterInstance.serverlessV2('writer', {
        caCertificate: CaCertificate.RDS_CA_ECC384_G1,
      }),
      // readers: [
      //   ClusterInstance.serverlessV2("reader1", {
      //     caCertificate: CaCertificate.RDS_CA_ECC384_G1,
      //     scaleWithWriter: true,
      //   }),
      // ],
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      vpc: base.vpc,
      securityGroups: [dbClusterSecurityGroup],
      port: databaseConfig.DB_PORT,
      serverlessV2MaxCapacity: 32,
      serverlessV2MinCapacity: 0.5,
      storageEncrypted: true,
      backtrackWindow: databaseConfig.backtrackWindow,
    });


    const hostedRotation = HostedRotation.mysqlSingleUser(
      {
        functionName: `DbSecretRotation-${Names.uniqueResourceName(this, {})}`,
        vpc: base.vpc,
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [
          new NoOutboundTrafficSecurityGroup(
            this, 'DbRotationLambda', { vpc: base.vpc },
          ),
        ],
      },
    );
    this.dbCluster.secret?.addRotationSchedule('Rotation', {
      hostedRotation: hostedRotation,
    });

    const secretsManagerEndpoint = base.httpsEndpoints.find(endpoint => endpoint.node.id === 'SecretsManagerEndpoint');
    if (secretsManagerEndpoint) {
      secretsManagerEndpoint.connections.allowFrom(hostedRotation, Port.tcp(443));
    }
    this.dbCluster.connections.allowFrom(hostedRotation, Port.tcp(databaseConfig.DB_PORT));

    NagSuppressions.addResourceSuppressions(
      this.dbCluster,
      [
        {
          id: 'AwsSolutions-RDS6',
          reason: 'CTFd cannot interact with iam resource',
        },
        {
          id: 'AwsSolutions-RDS10',
          reason: 'for RDS to ensure removal with CFn',
        },
      ],
    );
  }
}
