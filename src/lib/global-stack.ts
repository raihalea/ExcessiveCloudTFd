import { Stack, StackProps } from 'aws-cdk-lib';
import { PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { BucketWithAccessKey } from './constructs/bucket';
import { Cdn } from './constructs/cdn';
import { Waf } from './constructs/waf';

interface GlobalStackProps extends StackProps {
  bucketWithAccessKey: BucketWithAccessKey;
  cloudfrontPublicKey: PublicKey;
}

export class GlobalStack extends Stack {
  constructor(scope: Construct, id: string, props: GlobalStackProps) {
    super(scope, id, props);

    const { bucketWithAccessKey, cloudfrontPublicKey } = props;

    const waf = new Waf(this, 'Waf');
    new Cdn(this, 'Cdn', {
      bucketWithAccessKey: bucketWithAccessKey,
      webAclId: waf.webAclId,
      cloudfrontPublicKey: cloudfrontPublicKey,
    });
  }
}
