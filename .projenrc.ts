import { awscdk, typescript } from 'projen';
const cdkProject = new awscdk.AwsCdkTypeScriptApp({
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

const lambdaTS = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'lambdaTS',
  parent: cdkProject,
  outdir: './src/lib/lambda/typescript',
  deps: [
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-ssm',
    '@types/aws-lambda',
  ],
  devDeps: [
    '@types/node',
  ],
});

cdkProject.synth();
lambdaTS.synth();