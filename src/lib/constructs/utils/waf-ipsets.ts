import { CfnIPSet } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface WafIpSetsProps {
  readonly namePrefix: string;
  readonly ipv4List?: string[];
  readonly ipv6List?: string[];
}

export class WafIpSets extends Construct {
  public readonly ipSetList: CfnIPSet[];

  constructor(scope: Construct, id: string, props: WafIpSetsProps) {
    super(scope, id);

    const { namePrefix, ipv4List, ipv6List } = props;

    this.ipSetList = [];

    let Ipv4Set, Ipv6Set;
    if (ipv4List && ipv4List.length > 0) {
      Ipv4Set = new CfnIPSet(this, `${namePrefix}Ipv4Set`, {
        name: `${namePrefix}Ipv4Set`,
        scope: 'CLOUDFRONT',
        ipAddressVersion: 'IPV4',
        addresses: ipv4List,
      });
      this.ipSetList.push(Ipv4Set);
    }
    if (ipv6List && ipv6List.length > 0) {
      Ipv6Set = new CfnIPSet(this, `${namePrefix}Ipv6Set`, {
        name: `${namePrefix}Ipv6Set`,
        scope: 'CLOUDFRONT',
        ipAddressVersion: 'IPV6',
        addresses: ipv6List,
      });
      this.ipSetList.push(Ipv6Set);
    }
  }
}
