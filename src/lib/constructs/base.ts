import {
  Vpc,
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpointOptions,
  InterfaceVpcEndpointAwsService,
  InterfaceVpcEndpoint,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';


export class Base extends Construct {
  readonly vpc: Vpc;
  readonly endpointsForECS: InterfaceVpcEndpoint[];
  readonly smtpEndpoint: InterfaceVpcEndpoint;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // prettier-ignore
    this.vpc = new Vpc(this, 'Vpc', { natGateways: 0, restrictDefaultSecurityGroup: true });

    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
    });

    this.smtpEndpoint = this.vpc.addInterfaceEndpoint('SesEndpoint', {
      service: InterfaceVpcEndpointAwsService.EMAIL_SMTP,
      lookupSupportedAzs: true,
    });

    // prettier-ignore
    const endpointOptionsForECS: {[name: string]: InterfaceVpcEndpointOptions} = {
      EcrEndpoint: {
        service: InterfaceVpcEndpointAwsService.ECR,
        // subnets: {subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}
      },
      EcrdkrEndpoint: {
        service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
        // subnets: {subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}
      },
      LogsEndpoint: {
        service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        // subnets: {subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}
      },
      SsmEndpoint: {
        service: InterfaceVpcEndpointAwsService.SSM,
        // subnets: {subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}
      },
      SsmMessagesEndpoint: {
        service: InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        // subnets: {subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}
      },
      SecretsManagerEndpoint: {
        service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        // subnets: {subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}
      },
    };

    // this.endpointsForECS: InterfaceVpcEndpoint[] = [];
    this.endpointsForECS = [];
    for (const [name, options] of Object.entries(endpointOptionsForECS)) {
      const endpoint = this.vpc.addInterfaceEndpoint(name, options);
      this.endpointsForECS.push(endpoint);
    }
  }
}
