import { AccessKey } from 'aws-cdk-lib/aws-iam';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import {
  ConfigurationSet,
  SuppressionReasons,
  ConfigurationSetTlsPolicy,
  EventDestination,
  CloudWatchDimension,
  CloudWatchDimensionSource,
  EmailIdentity,
  Identity,
} from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';
import { SmtpCredentialsGenerator } from './utils/smtp-credentials-generator';
import { domainConfig } from '../config/config';


export class Mail extends Construct {
  readonly smtpAccessKey: AccessKey;
  readonly smtpSecretAccessKey: Secret;
  readonly configurationSet: ConfigurationSet;
  readonly cloudWatchDimension: CloudWatchDimension;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const smtp = new SmtpCredentialsGenerator(this, 'SMTP');
    this.smtpAccessKey = smtp.smtpAccessKey;
    this.smtpSecretAccessKey = smtp.smtpSecretAccessKey;

    const mailDomain = `${domainConfig.MAIL}.${domainConfig.DOMAIN_NAME}`;
    const hostedZone = HostedZone.fromLookup(this, 'Domain', {
      domainName: domainConfig.DOMAIN_NAME,
    });

    this.configurationSet = new ConfigurationSet(this, 'ConfigurationSet', {
      customTrackingRedirectDomain: domainConfig.DOMAIN_NAME,
      suppressionReasons: SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      tlsPolicy: ConfigurationSetTlsPolicy.REQUIRE,
      reputationMetrics: true,
    });

    this.cloudWatchDimension = {
      defaultValue: 'mail',
      name: 'CTFd',
      source: CloudWatchDimensionSource.EMAIL_HEADER,
    };

    this.configurationSet.addEventDestination('test', {
      destination: EventDestination.cloudWatchDimensions([
        this.cloudWatchDimension,
      ]),
    });

    new EmailIdentity(this, 'Identity', {
      identity: Identity.publicHostedZone(hostedZone),
      mailFromDomain: mailDomain,
      configurationSet: this.configurationSet,
    });
  }
}
