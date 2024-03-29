import { Environment } from 'aws-cdk-lib';

export const awsConfig: Environment = {
  account: '123456789012',
  region: 'us-east-1',
};

export const globalConfig: Environment = {
  account: '123456789012',
  region: 'us-east-1',
};

export interface dbConfig {
  DB_USER: string;
  DB_PORT: number;
}
export const databaseConfig: dbConfig = {
  DB_USER: 'ctfd',
  DB_PORT: 3306,
};
export const redisConfig: dbConfig = {
  DB_USER: 'ctfd',
  DB_PORT: 6379,
};

// RECORD.DOMAIN_NAME
export interface DomainConfig {
  DOMAIN_NAME: string;
  HOSTNAME: string;
  ALB_HOSTNAME: string;
  MAIL: string;
}
export const domainConfig:DomainConfig = {
  DOMAIN_NAME: 'example.com',
  HOSTNAME: 'ctf',
  ALB_HOSTNAME: 'ctf-alb',
  MAIL: 'mail',
};

export const basicAuthConfig = {
  IsEnabled: true,
  USER: 'user',
  PASS: 'pass',
};

interface WafConfig {
  isEnabled: boolean;
  allowTrustedIpsRule: RuleEnableWithIpConfig;
  sizeRestrictionRule: RuleEnableConfig;
  blockNonSpecificIps: RuleEnableWithIpConfig;
  geoMatchRule: RuleEnableConfig;
  limitRequestsRule: RuleEnableConfig;
  managedRules: RuleEnableConfig;
}
interface RuleEnableWithIpConfig extends RuleEnableConfig {
  IPv4List: string[];
  IPv6List: string[];
}
interface RuleEnableWithIpConfig extends RuleEnableConfig {
  IPv4List: string[];
  IPv6List: string[];
}
interface RuleEnableConfig {
  isEnabled: boolean;
}
export const wafConfig: WafConfig = {
  isEnabled: true,
  allowTrustedIpsRule: {
    isEnabled: true,
    IPv4List: [
      // "192.0.2.0/24",
      // "198.51.100.0/24"
    ],
    IPv6List: [
      // "2001:db8::/32",
    ],
  },
  sizeRestrictionRule: {
    isEnabled: true,
  },
  blockNonSpecificIps: {
    isEnabled: true,
    IPv4List: [
      // "192.0.2.0/24",
      // "198.51.100.0/24"
    ],
    IPv6List: [
      // "2001:db8::/32",
    ],
  },
  geoMatchRule: {
    isEnabled: true,
  },
  limitRequestsRule: {
    isEnabled: true,
  },
  managedRules: {
    isEnabled: true,
  },
};
