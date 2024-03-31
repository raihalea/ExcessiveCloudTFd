import { Stack, StackProps } from 'aws-cdk-lib';
import { PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { Cdn } from './constructs/cdn';
import { Waf } from './constructs/waf';

interface GlobalStackProps extends StackProps {
  contentsBucket: Bucket;
  cloudfrontPublicKey: PublicKey;
}

export class GlobalStack extends Stack {
  constructor(scope: Construct, id: string, props: GlobalStackProps) {
    super(scope, id, props);

    const { contentsBucket, cloudfrontPublicKey } = props;

    const waf = new Waf(this, 'Waf');
    new Cdn(this, 'Cdn', {
      contentsBucket: contentsBucket,
      webAclId: waf.webAclId,
      cloudfrontPublicKey: cloudfrontPublicKey,
    });
  }
}
