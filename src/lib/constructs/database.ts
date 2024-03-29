import { RemovalPolicy } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  DatabaseCluster,
  DatabaseClusterEngine,
  AuroraMysqlEngineVersion,
  Credentials,
  ClusterInstance,
  CaCertificate,
} from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import { NoOutboundTrafficSecurityGroup } from './utils/default-security-group';
import { databaseConfig } from '../config/config';

export interface DatabaseProps {
  readonly vpc: Vpc;
}

export class Database extends Construct {
  readonly DB_USERNAME: string;
  readonly dbCluster: DatabaseCluster;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const { vpc } = props;

    // prettier-ignore
    this.DB_USERNAME = databaseConfig.DB_USER;

    // prettier-ignore
    const dbClusterSecurityGroup = new NoOutboundTrafficSecurityGroup(
      this, 'DbSecurityGroup', { vpc },
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
      vpc,
      securityGroups: [dbClusterSecurityGroup],
      port: databaseConfig.DB_PORT,
      serverlessV2MaxCapacity: 32,
      serverlessV2MinCapacity: 0.5,
      storageEncrypted: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
