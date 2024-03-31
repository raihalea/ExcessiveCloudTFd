import { Stack, StackProps } from 'aws-cdk-lib';
import { PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ApplicationPatterns } from './constructs/application-patterns';
import { Base } from './constructs/base';
import { Database } from './constructs/database';
import { Mail } from './constructs/mail';
import { Monitor } from './constructs/monitor';
import { Redis } from './constructs/redis';

export class CloudTFdStack extends Stack {
  readonly contentsBucket: Bucket;
  readonly cloudfrontPublicKey: PublicKey;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const base = new Base(this, 'Base');
    const database = new Database(this, 'Database', { vpc: base.vpc });
    const redis = new Redis(this, 'Redis', { vpc: base.vpc });
    const mail = new Mail(this, 'Mail');
    const ctfd = new ApplicationPatterns(this, 'ApplicationPatterns', {
      vpc: base.vpc,
      endpointsForECS: base.endpointsForECS,
      smtpEndpoint: base.smtpEndpoint,
      database,
      redis,
      mail,
    });
    this.cloudfrontPublicKey = ctfd.cloudfrontPublicKey;
    this.contentsBucket = ctfd.contentsBucket;
    new Monitor(this, 'Monitor', {
      database,
      redis,
      mail,
      ctfd,
    });
  }
}
