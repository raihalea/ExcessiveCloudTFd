import { RemovalPolicy } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  DatabaseInstance,
  DatabaseInstanceEngine,
  Credentials,
} from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import { NoOutboundTrafficSecurityGroup } from './utils/default-security-group';
import { databaseConfig } from '../config/config';

export interface DatabaseProps {
  readonly vpc: Vpc;
}

export class Database extends Construct {
  readonly DB_USERNAME: string;
  readonly dbCluster: DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const { vpc } = props;

    this.DB_USERNAME = databaseConfig.DB_USER;

    const dbClusterSecurityGroup = new NoOutboundTrafficSecurityGroup(
      this, 'DbSecurityGroup', { vpc },
    );

    this.dbCluster = new DatabaseInstance(this, 'Db', {
      engine: DatabaseInstanceEngine.MYSQL,
      credentials: Credentials.fromGeneratedSecret(this.DB_USERNAME),
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      vpc,
      securityGroups: [dbClusterSecurityGroup],
      port: databaseConfig.DB_PORT,
      storageEncrypted: true,
      enablePerformanceInsights: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
