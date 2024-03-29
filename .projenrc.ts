import { awscdk } from 'projen';
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.116.0',
  defaultReleaseBranch: 'main',
  name: 'CloudTFd',
  projenrcTs: true,

  gitignore: [
    'cdk.context.json',
    'config.ts',
  ],
  deps: [
    'cdk-monitoring-constructs',
    '@aws-cdk/aws-redshift-alpha',
    'constructs',
  ],
  devDeps: ['@types/aws-lambda'],
});
project.synth();