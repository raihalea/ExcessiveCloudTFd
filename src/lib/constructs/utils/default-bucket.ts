import { RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Bucket, BucketProps } from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export class AutoCleanupBucket extends Bucket {
  constructor(scope: Construct, id: string, props?: BucketProps) {
    super(scope, id, {
      ...props,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          expiration: Duration.days(7),
        },
      ],
    });
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'Not needed for this project.',
        },
      ],
    );
  }
}
