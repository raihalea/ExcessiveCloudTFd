import { CustomResource, Duration } from 'aws-cdk-lib';
import {
  User,
  Policy,
  Effect,
  AccessKey,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import {
  Provider,
} from 'aws-cdk-lib/custom-resources';

import { Construct } from 'constructs';


export class SmtpCredentialsGenerator extends Construct {
  readonly smtpAccessKey: AccessKey;
  readonly smtpSecretAccessKey: Secret;

  constructor(
    scope: Construct,
    id: string,
  ) {
    super(scope, id);

    const user = new User(this, 'SmtpUser');
    const policy = new Policy(this, 'SmtpPolicy', {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['ses:SendRawEmail'],
          resources: ['*'],
        }),
      ],
    });
    user.attachInlinePolicy(policy);

    this.smtpAccessKey = new AccessKey(this, 'SmtpAccessKey', { user });
    this.smtpSecretAccessKey = new Secret(this, 'SmtpSecretAccessKey', {
      secretObjectValue: {
        userSecretAccessKey: this.smtpAccessKey.secretAccessKey,
      },
    });

    const onEvent = new Function(this, 'SmtpCredentialsGenerator', {
      runtime: Runtime.PYTHON_3_11,
      architecture: Architecture.ARM_64,
      code: Code.fromAsset('./src/lib/lambda/smtp_credentials_generate/smtp_credentials_generate'),
      handler: 'smtp_credentials_generate.handler',
      environment: {
        SECRET_ARN: this.smtpSecretAccessKey.secretArn,
        USER_SECRETKEY: 'userSecretAccessKey',
        SMTP_SECRETKEY: 'smtpSecret',
      },
      timeout: Duration.seconds(10),
      logRetention: RetentionDays.ONE_DAY,
    });

    this.smtpSecretAccessKey.grantWrite(onEvent);
    this.smtpSecretAccessKey.grantRead(onEvent);

    const smtpSecretProvider = new Provider(this, 'SmtpSecretProvider', {
      onEventHandler: onEvent,
    });

    new CustomResource(
      this,
      'SmtpSecretCustomResource',
      {
        serviceToken: smtpSecretProvider.serviceToken,
      },
    );
  }
}
