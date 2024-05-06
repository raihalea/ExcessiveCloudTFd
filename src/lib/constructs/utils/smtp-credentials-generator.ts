import { CustomResource, Duration } from 'aws-cdk-lib';
import {
  User,
  AccessKey,
} from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { EmailIdentity } from 'aws-cdk-lib/aws-ses';
import {
  Provider,
} from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export interface SmtpCredentialsGeneratorProps {
  readonly emailIdentity: EmailIdentity;
}
export class SmtpCredentialsGenerator extends Construct {
  readonly smtpAccessKey: AccessKey;
  readonly smtpSecretAccessKey: Secret;

  constructor(
    scope: Construct,
    id: string,
    props: SmtpCredentialsGeneratorProps,
  ) {
    super(scope, id);
    const { emailIdentity } = props;

    const user = new User(this, 'SmtpUser');
    emailIdentity.grantSendEmail(user);

    this.smtpAccessKey = new AccessKey(this, 'SmtpAccessKey', { user });
    this.smtpSecretAccessKey = new Secret(this, 'SmtpSecretAccessKey', {
      secretObjectValue: {
        userSecretAccessKey: this.smtpAccessKey.secretAccessKey,
      },
    });

    const onEvent = new Function(this, 'SmtpCredentialsGenerator', {
      runtime: Runtime.PYTHON_3_12,
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

    const now = new Date();
    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    this.smtpSecretAccessKey.grantRead(onEvent).principalStatements.forEach((statement) => {
      statement.addConditions(
        {
          DateGreaterThan: { 'aws:CurrentTime': now.toISOString() },
          DateLessThan: { 'aws:CurrentTime': threeHoursLater.toISOString() },
        },
      );
    });

    const smtpSecretProvider = new Provider(this, 'SmtpSecretProvider', {
      onEventHandler: onEvent,
      logRetention: RetentionDays.ONE_DAY,
    });

    new CustomResource(
      this,
      'SmtpSecretCustomResource',
      {
        serviceToken: smtpSecretProvider.serviceToken,
      },
    );

    NagSuppressions.addResourceSuppressions(this.smtpSecretAccessKey, [
      {
        id: 'AwsSolutions-SMG4',
        reason: "It would be better to support it, but it's not supported yet.",
      },
    ]);
    NagSuppressions.addResourceSuppressions(
      smtpSecretProvider,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Uncontrollable due to CDK-generated custom resource.',
          appliesTo: [
            {
              regex: '/^Resource::.*:\\*$/g',
            },
          ],
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'Uncontrollable due to CDK-generated custom resource.',
        },
      ],
      true,
    );
  }
}
