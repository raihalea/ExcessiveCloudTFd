import {
  Vpc,
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpointOptions,
  InterfaceVpcEndpointAwsService,
  InterfaceVpcEndpoint,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { NoOutboundTrafficSecurityGroup } from './utils/default-security-group';

export class Base extends Construct {
  readonly vpc: Vpc;
  readonly httpsEndpoints: InterfaceVpcEndpoint[];
  readonly smtpEndpoint: InterfaceVpcEndpoint;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new Vpc(this, 'Vpc', { natGateways: 0, restrictDefaultSecurityGroup: true });

    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
    });

    this.smtpEndpoint = this.vpc.addInterfaceEndpoint('SesEndpoint', {
      service: InterfaceVpcEndpointAwsService.EMAIL_SMTP,
      lookupSupportedAzs: true,
      securityGroups: [new NoOutboundTrafficSecurityGroup(
        this, 'SmtpSG', { vpc: this.vpc },
      )],
    });

    const httpsEndpointOptions: {[name: string]: InterfaceVpcEndpointOptions} = {
      EcrEndpoint: {
        service: InterfaceVpcEndpointAwsService.ECR,
        securityGroups: [new NoOutboundTrafficSecurityGroup(
          this, 'EcrSG', { vpc: this.vpc },
        )],
      },
      EcrdkrEndpoint: {
        service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
        securityGroups: [new NoOutboundTrafficSecurityGroup(
          this, 'EcrDkrSG', { vpc: this.vpc },
        )],
      },
      LogsEndpoint: {
        service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        securityGroups: [new NoOutboundTrafficSecurityGroup(
          this, 'LogsSG', { vpc: this.vpc },
        )],
      },
      SsmEndpoint: {
        service: InterfaceVpcEndpointAwsService.SSM,
        securityGroups: [new NoOutboundTrafficSecurityGroup(
          this, 'SsmSG', { vpc: this.vpc },
        )],
      },
      SsmMessagesEndpoint: {
        service: InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        securityGroups: [new NoOutboundTrafficSecurityGroup(
          this, 'SsmMessageSG', { vpc: this.vpc },
        )],
      },
      SecretsManagerEndpoint: {
        service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        securityGroups: [new NoOutboundTrafficSecurityGroup(
          this, 'SecretsManagerSG', { vpc: this.vpc },
        )],
      },
    };

    this.httpsEndpoints = [];
    for (const [name, options] of Object.entries(httpsEndpointOptions)) {
      const endpoint = this.vpc.addInterfaceEndpoint(name, options);
      this.httpsEndpoints.push(endpoint);
    }
  }
}
