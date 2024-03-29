import { Stack, StackProps } from 'aws-cdk-lib';
import { PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { ApplicationPatterns } from './constructs/application-patterns';
import { Base } from './constructs/base';
import { BucketWithAccessKey } from './constructs/bucket';
import { Database } from './constructs/database';
import { Mail } from './constructs/mail';
import { Monitor } from './constructs/monitor';
import { Redis } from './constructs/redis';

export class CloudTFdStack extends Stack {
  readonly bucketWithAccessKey: BucketWithAccessKey;
  readonly cloudfrontPublicKey: PublicKey;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const base = new Base(this, 'Base');
    this.bucketWithAccessKey = new BucketWithAccessKey(this, 'Default');
    const database = new Database(this, 'Database', { vpc: base.vpc });
    const redis = new Redis(this, 'Redis', { vpc: base.vpc });
    const mail = new Mail(this, 'Mail');
    const ctfd = new ApplicationPatterns(this, 'ApplicationPatterns', {
      vpc: base.vpc,
      bucketWithAccessKey: this.bucketWithAccessKey,
      endpointsForECS: base.endpointsForECS,
      smtpEndpoint: base.smtpEndpoint,
      database,
      redis,
      mail,
    });
    this.cloudfrontPublicKey = ctfd.cloudfrontPublicKey;
    new Monitor(this, 'Monitor', {
      database,
      redis,
      mail,
      ctfd,
    });
  }
}
