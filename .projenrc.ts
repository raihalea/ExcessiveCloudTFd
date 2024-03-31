import { awscdk, typescript, python } from 'projen';
const cdkProject = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.116.0',
  defaultReleaseBranch: 'main',
  name: 'CloudTFd',
  projenrcTs: true,

  gitignore: [
    'cdk.context.json',
    'config.ts',
    '/__snapshots__/',
  ],
  deps: [
    'cdk-monitoring-constructs',
    '@aws-cdk/aws-redshift-alpha',
    'constructs',
  ],
  devDeps: ['@types/aws-lambda'],
});


const cloudfrontKeypair = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'cloudfrontKeypair',
  parent: cdkProject,
  outdir: './src/lib/lambda/cloudfront_keypair',
  deps: [
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-ssm',
    '@types/aws-lambda',
  ],
  devDeps: [
    '@types/node',
  ],
});

const smtpCredentialsGenerate = new python.PythonProject({
  name: 'smtp_credentials_generate',
  parent: cdkProject,
  outdir: './src/lib/lambda/smtp_credentials_generate',
  moduleName: 'smtp_credentials_generate',
  authorName: 'raiha',
  authorEmail: 'raiha@example.com',
  version: '0.1.0',
  devDeps: [
    'moto@^5.0.0',
  ],
});

cdkProject.synth();
smtpCredentialsGenerate.synth();
cloudfrontKeypair.synth();
