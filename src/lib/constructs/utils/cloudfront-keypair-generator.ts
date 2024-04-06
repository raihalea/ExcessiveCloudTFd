import { CustomResource, Duration, Names } from 'aws-cdk-lib';
import { PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import { KeyPair, KeyPairType, KeyPairFormat } from 'aws-cdk-lib/aws-ec2';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { StringParameter, IStringParameter } from 'aws-cdk-lib/aws-ssm';
import { Provider } from 'aws-cdk-lib/custom-resources';

import { Construct } from 'constructs';

export class CloudFrontKeyPairGenerator extends Construct {
  readonly publicKey: PublicKey;
  readonly privateKeyParameter: IStringParameter;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const keyPair = new KeyPair(this, 'CloudFrontKeyPair', {
      type: KeyPairType.RSA,
      format: KeyPairFormat.PEM,
    });

    this.privateKeyParameter = keyPair.privateKey;

    const parameterName = `publickey-${Names.uniqueId(scope)}`;
    const publicKeyParamter = new StringParameter(this, 'PublicKeyParameter', {
      stringValue: 'dummy',
      parameterName: parameterName,
    });

    const onEvent = new NodejsFunction(
      this,
      'CloudFrontKeyPairGenerator',
      {
        entry: './src/lib/lambda/cloudfront_keypair/src/lambda_function.ts',
        depsLockFilePath: './package-lock.json',
        handler: 'handler',
        runtime: Runtime.NODEJS_18_X,
        environment: {
          PRIVATEKEY_PARAMETER: this.privateKeyParameter.parameterName,
          PUBLICKEY_PARAMETER: publicKeyParamter.parameterName,
        },
        timeout: Duration.seconds(30),
        logRetention: RetentionDays.ONE_DAY,
      },
    );

    publicKeyParamter.grantWrite(onEvent);

    const now = new Date();
    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    this.privateKeyParameter.grantRead(onEvent).principalStatements.forEach((statement) => {
      statement.addConditions(
        {
          DateGreaterThan: { 'aws:CurrentTime': now.toISOString() },
          DateLessThan: { 'aws:CurrentTime': threeHoursLater.toISOString() },
        },
      );
    });

    const cloudFrontKeyPairProvider = new Provider(
      this,
      'CloudFrontKeyPairProvider',
      {
        onEventHandler: onEvent,
        logRetention: RetentionDays.ONE_DAY,
      },
    );

    const cloudFrontKeyPairCustomResource = new CustomResource(
      this,
      'CloudFrontKeyPairCustomResource',
      {
        serviceToken: cloudFrontKeyPairProvider.serviceToken,
      },
    );

    this.publicKey = new PublicKey(this, 'PublicKey', {
      encodedKey:
        cloudFrontKeyPairCustomResource.getAttString('PublicKeyEncoded'),
    });
    this.publicKey.node.addDependency(cloudFrontKeyPairCustomResource);
  }
}
