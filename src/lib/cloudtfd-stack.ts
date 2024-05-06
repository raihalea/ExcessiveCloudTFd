import { Stack, StackProps } from 'aws-cdk-lib';
import { PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
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
    const database = new Database(this, 'Database', { base });
    const redis = new Redis(this, 'Redis', { base });
    const mail = new Mail(this, 'Mail');
    const ctfd = new ApplicationPatterns(this, 'ApplicationPatterns', {
      base,
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

    NagSuppressions.addStackSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-VPC7',
          reason: 'Not needed for this project',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWSLambdaBasicExecutionRole is allowd',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
          id: 'CdkNagValidationFailure',
          reason: 'https://github.com/cdklabs/cdk-nag/issues/817',
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      '/CloudTFdStack/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource',
      [{ id: 'AwsSolutions-IAM5', reason: 'Uncontrollable due to CDK-generated custom resource.' }],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      '/CloudTFdStack/AWS679f53fac002430cb0da5b7982bd2287/Resource',
      [{ id: 'AwsSolutions-L1', reason: 'Uncontrollable due to CDK-generated custom resource.' }],
    );
  }
}
