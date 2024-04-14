import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  PublicKey,
  KeyGroup,
  CacheCookieBehavior,
  CacheHeaderBehavior,
  CacheQueryStringBehavior,
  Distribution,
  AllowedMethods,
  ViewerProtocolPolicy,
  OriginRequestPolicy,
  CachePolicy,
  OriginRequestCookieBehavior,
  OriginRequestHeaderBehavior,
  OriginRequestQueryStringBehavior,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ARecord, AaaaRecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { BasicAuth } from './basic-auth';
import { Domain } from './utils/domain';
import { domainConfig, basicAuthConfig } from '../config/config';

export interface CdnProps {
  readonly contentsBucket: Bucket;
  readonly webAclId?: string;
  readonly cloudfrontPublicKey: PublicKey;
}

export class Cdn extends Construct {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: CdnProps) {
    super(scope, id);

    const { contentsBucket, webAclId, cloudfrontPublicKey } = props;

    const publicKey = PublicKey.fromPublicKeyId(
      this,
      'CloudFrontPublicKey',
      cloudfrontPublicKey.publicKeyId,
    );

    const keyGroup = new KeyGroup(this, 'MyKeyGroup', {
      items: [publicKey],
    });

    const ctfDomain = new Domain(this, 'Domain', {
      hostname: domainConfig.HOSTNAME,
      domain: domainConfig.DOMAIN_NAME,
    });

    new CachePolicy(this, 'MyCachePolicy', {
      defaultTtl: Duration.days(2),
      minTtl: Duration.minutes(1),
      maxTtl: Duration.days(10),
      cookieBehavior: CacheCookieBehavior.none(),
      headerBehavior: CacheHeaderBehavior.allowList(
        'Host',
        'CloudFront-Forwarded-Proto',
      ),
      queryStringBehavior: CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const allViewRequestPolicy = new OriginRequestPolicy(
      this,
      'MyRequestPolicy',
      {
        cookieBehavior: OriginRequestCookieBehavior.all(),
        headerBehavior: OriginRequestHeaderBehavior.denyList('Authorization'),
        queryStringBehavior: OriginRequestQueryStringBehavior.all(),
      },
    );

    const albOrigin = new HttpOrigin(`${domainConfig.ALB_HOSTNAME}.${domainConfig.DOMAIN_NAME}`);
    const s3Origin = new S3Origin(contentsBucket);
    const basicAuth = new BasicAuth(this, 'BasicAuth');
    const functionAssociations = basicAuthConfig.IsEnabled
      ? [basicAuth.functionAssociation]
      : [];

    const logBucket = new Bucket(this, 'LogBucket', {
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_PREFERRED,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          expiration: Duration.days(7),
        },
      ],
    });

    const themeCachePolicy = new CachePolicy(this, 'ThemeCachePolicy', {
      defaultTtl: Duration.hours(1),
      minTtl: Duration.hours(1),
      maxTtl: Duration.days(7),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
    });

    this.distribution = new Distribution(this, 'CloudFront', {
      defaultBehavior: {
        origin: albOrigin,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: allViewRequestPolicy,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        compress: true,
        functionAssociations: functionAssociations,
      },
      additionalBehaviors: {
        'themes/*': {
          origin: albOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: themeCachePolicy,
          compress: true,
        },
        'api/*': {
          origin: albOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: allViewRequestPolicy,
          compress: true,
          functionAssociations: functionAssociations,
        },
        'admin/*': {
          origin: albOrigin,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: allViewRequestPolicy,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          compress: true,
          functionAssociations: functionAssociations,
        },
        // "files/s3/*": {
        //   origin: albOrigin,
        //   viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        //   cachePolicy: CachePolicy.CACHING_DISABLED,
        //   originRequestPolicy: allViewRequestPolicy,
        //   compress: true,
        //   functionAssociations: functionAssociations
        // },
        'files/s3/*': {
          origin: s3Origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
          compress: true,
          functionAssociations: functionAssociations,
          trustedKeyGroups: [keyGroup],
        },
      },
      domainNames: [ctfDomain.fqdn],
      certificate: ctfDomain.certificate,
      webAclId: webAclId,
      logBucket: logBucket,
    });

    new ARecord(this, 'ARecord', {
      recordName: `${domainConfig.HOSTNAME}`,
      zone: ctfDomain.hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });
    new AaaaRecord(this, 'AaaaRecord', {
      recordName: `${domainConfig.HOSTNAME}`,
      zone: ctfDomain.hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });
  }
}
