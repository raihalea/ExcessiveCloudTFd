import { RemovalPolicy, Stack, Names } from 'aws-cdk-lib';
// import { Duration, RemovalPolicy, Stack, Names } from 'aws-cdk-lib';
// import { Bucket } from "aws-cdk-lib/aws-s3";
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
// import { LogGroup, RetentionDays, CfnLogGroup } from 'aws-cdk-lib/aws-logs';
import {
  CfnRuleGroup,
  CfnWebACL,
  CfnIPSet,
  CfnLoggingConfiguration,
} from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { WafIpSets } from './utils/waf-ipsets';
import { WafStatements } from './utils/waf-statement';
import { wafConfig } from '../config/config';


export interface WafIpSetsDict {
  trustedIpsList: WafIpSets;
  adminIpsSetList: WafIpSets;
  blockNonSpecificIpsRule: WafIpSets;
}

export class Waf extends Construct {
  /**
   * See: https://github.com/aws-samples/aws-cdk-examples/blob/master/typescript/waf/waf-cloudfront.ts
   */

  readonly webAclId?: string;
  readonly wafAclCloudFront?: CfnWebACL;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    if (wafConfig.isEnabled == false) {
      return;
    }

    const stack = Stack.of(this);
    const stackId = Names.uniqueResourceName(this, {}).toLowerCase();
    const region = stack.region;
    const logName = `aws-waf-logs-${stackId}-${region}`;

    // const wafBucket = new Bucket(this, "S3", {
    //   bucketName: logName,
    //   enforceSSL: true,
    //   autoDeleteObjects: true,
    //   removalPolicy: RemovalPolicy.DESTROY,
    //   lifecycleRules: [
    //     {
    //       expiration: Duration.days(7),
    //     },
    //   ],
    // });

    const logGroup = new LogGroup(this, 'WafLogGroup', {
      logGroupName: logName,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const ipSetsDict = {
      trustedIpsList: new WafIpSets(this, 'TrustedIpsList', {
        namePrefix: 'Trusted',
        ipv4List: wafConfig.emergencyTrustedIpsRule.IPv4List,
        ipv6List: wafConfig.emergencyTrustedIpsRule.IPv6List,
      }),
      adminIpsSetList: new WafIpSets(this, 'adminIpsSetList', {
        namePrefix: 'Admin',
        ipv4List: wafConfig.adminIpsRule.IPv4List,
        ipv6List: wafConfig.adminIpsRule.IPv6List,
      }),
      blockNonSpecificIpsRule: new WafIpSets(this, 'BlockNonSpecificIpsRule', {
        namePrefix: 'Specific',
        ipv4List: wafConfig.blockNonSpecificIpsRule.IPv4List,
        ipv6List: wafConfig.blockNonSpecificIpsRule.IPv6List,
      }),
    };

    this.wafAclCloudFront = new CfnWebACL(this, 'WafCloudFront', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'waf-cloudfront',
        sampledRequestsEnabled: true,
      },
      rules: this.makeRules(ipSetsDict),
    });

    new CfnLoggingConfiguration(this, 'WafLogging', {
      resourceArn: this.wafAclCloudFront.attrArn,
      logDestinationConfigs: [logGroup.logGroupArn],
    });

    this.webAclId = this.wafAclCloudFront.attrArn;
  }


  private makeRules(ipSetsDict: WafIpSetsDict): CfnRuleGroup.RuleProperty[] {
    const rules: CfnRuleGroup.RuleProperty[] = [];

    // Bypass Trusted IP
    if (wafConfig.emergencyTrustedIpsRule.isEnabled) {
      const emergencyAllowIpsRule = this.createRuleEmergencyAllowIps(
        rules.length,
        ipSetsDict.trustedIpsList.ipSetList,
      );
      rules.push(emergencyAllowIpsRule);
    }

    // Rate Based Rule
    if (wafConfig.limitRequestsRule.isEnabled) {
      const limitRequestsRule = this.createRuleLimitRequests(rules.length);
      rules.push(limitRequestsRule);
    }

    // allows requests from specific IPs
    if (wafConfig.adminIpsRule.isEnabled) {
      const adminIpRule = this.createSizeRestrictionExcludedAdmin(
        rules.length,
        ipSetsDict.adminIpsSetList.ipSetList,
      );
      rules.push(adminIpRule);
    }

    // IP Block Rule
    if (wafConfig.blockNonSpecificIpsRule.isEnabled) {
      const blockNonSpecificIpsRule = this.createRuleBlockNonSpecificIps(
        rules.length,
        ipSetsDict.blockNonSpecificIpsRule.ipSetList,
      );
      rules.push(blockNonSpecificIpsRule);
    }

    // Geo Based Rule
    if (wafConfig.geoMatchRule.isEnabled) {
      const geoMatchRule = this.createRuleGeoMatch(rules.length);
      rules.push(geoMatchRule);
    }

    // AWS ManagedRules
    if (wafConfig.managedRules.isEnabled) {
      const managedRuleGroups = this.createManagedRules(rules.length);
      rules.push(...managedRuleGroups);

      const XsslabelMatchRule = this.createXSSLabelMatch(
        rules.length,
        ipSetsDict.adminIpsSetList.ipSetList,
      );
      rules.push(XsslabelMatchRule);
    }

    return rules;
  }

  private createRuleEmergencyAllowIps(
    priority: number,
    trustedIpsList: CfnIPSet[],
  ): CfnRuleGroup.RuleProperty {
    const ipSetList = trustedIpsList;

    return WafStatements.allow(
      'TrustedIp',
      priority,
      WafStatements.ipv4v6Match(ipSetList),
    );
  }

  private createSizeRestrictionExcludedAdmin(
    priority: number,
    adminIpsSetList: CfnIPSet[],
  ): CfnRuleGroup.RuleProperty {
    const urlConditons = WafStatements.or(
      WafStatements.startsWithURL('/api/'),
      WafStatements.exactlyURL('/setup'),
    );

    let combinedConditions;
    if (adminIpsSetList.length === 0) {
      combinedConditions = urlConditons;
    } else {
      combinedConditions = WafStatements.and(
        urlConditons,
        WafStatements.ipv4v6Match(adminIpsSetList),
      );
    }

    return WafStatements.block(
      'SizeRestriction',
      priority,
      WafStatements.and(
        WafStatements.oversizedRequestBody(16 * 1024), //16KB
        WafStatements.not(combinedConditions),
      ),
    );
  }

  private createRuleLimitRequests(priority: number): CfnRuleGroup.RuleProperty {
    return WafStatements.block(
      'LimitRequests',
      priority,
      WafStatements.rateBasedByIp(1000),
    );
  }

  private createRuleBlockNonSpecificIps(
    priority: number,
    blockNonSpecificIpSetList: CfnIPSet[],
  ): CfnRuleGroup.RuleProperty {
    const ipSetList = blockNonSpecificIpSetList;

    return WafStatements.block(
      'AllowedIp',
      priority,
      WafStatements.not(WafStatements.ipv4v6Match(ipSetList)),
    );
  }

  private createRuleGeoMatch(priority: number): CfnRuleGroup.RuleProperty {
    return WafStatements.block(
      'GeoMatch',
      priority,
      WafStatements.not(WafStatements.matchCountryCodes(['JP'])),
    );
  }

  private createXSSLabelMatch(
    priority: number,
    adminIpsSetList: CfnIPSet[],
  ): CfnRuleGroup.RuleProperty {
    const ipSetList = adminIpsSetList;

    const urlConditons = WafStatements.or(
      WafStatements.startsWithURL('/api/'),
      WafStatements.exactlyURL('/setup'),
    );

    let combinedConditions;
    if (ipSetList.length === 0) {
      combinedConditions = urlConditons;
    } else {
      combinedConditions = WafStatements.and(
        urlConditons,
        WafStatements.ipv4v6Match(ipSetList),
      );
    }

    return WafStatements.block(
      'XssLabelMatch',
      priority,
      WafStatements.and(
        WafStatements.matchLabel(
          'LABEL',
          'awswaf:managed:aws:core-rule-set:CrossSiteScripting_Body',
        ),
        WafStatements.not(combinedConditions),
      ),
    );
  }

  // aws managed rules
  private createManagedRules(
    startPriorityNumber: number,
  ): CfnRuleGroup.RuleProperty[] {
    var rules: CfnRuleGroup.RuleProperty[] = [];
    interface listOfRules {
      name: string;
      priority?: number;
      overrideAction: string;
      excludedRules: string[];
      scopeDownStatement?: CfnWebACL.StatementProperty;
    }
    const managedRules: listOfRules[] = [
      // {
      //   name: "EXAMPLE_MANAGED_RULEGROUP",
      //   priority: 20, // if not specified, priority is automatically assigned.
      //   overrideAction: "none",
      //   excludedRules: ["EXCLUDED_MANAGED_RULE"],
      //   scopeDownStatement: WafStatements.not(WafStatements.startsWithURL("/admin")),
      // },
      {
        name: 'AWSManagedRulesCommonRuleSet',
        overrideAction: 'none',
        excludedRules: ['SizeRestrictions_BODY', 'CrossSiteScripting_BODY'],
      },
      {
        name: 'AWSManagedRulesAmazonIpReputationList',
        overrideAction: 'none',
        excludedRules: [],
      },
      {
        name: 'AWSManagedRulesKnownBadInputsRuleSet',
        overrideAction: 'none',
        excludedRules: [],
      },
      {
        name: 'AWSManagedRulesAnonymousIpList',
        overrideAction: 'none',
        excludedRules: [],
      },
      {
        name: 'AWSManagedRulesLinuxRuleSet',
        overrideAction: 'none',
        excludedRules: [],
      },
      {
        name: 'AWSManagedRulesSQLiRuleSet',
        overrideAction: 'none',
        excludedRules: [],
      },
    ];

    managedRules.forEach((r, index) => {
      var rule: CfnWebACL.RuleProperty = WafStatements.managedRuleGroup(
        r,
        startPriorityNumber,
        index,
      );

      rules.push(rule);
    });

    return rules;
  }
}
