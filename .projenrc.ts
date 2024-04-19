import { awscdk, typescript, python } from 'projen';
const cdkProject = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.116.0',
  defaultReleaseBranch: 'main',
  name: 'CloudTFd',
  repository: 'https://github.com/raihalea/ExcessiveCloudTFd.git',
  projenrcTs: true,

  gitignore: [
    'config.ts',
    'test/__snapshots__',
  ],
  deps: [
    'cdk-monitoring-constructs',
    '@aws-cdk/aws-redshift-alpha',
    'constructs',
  ],
  devDeps: ['@types/aws-lambda'],
});

cdkProject.addTask('initial-ctfd-repos', {
  steps: [
    {
      name: 'add-ctfd',
      exec: 'git submodule add https://github.com/CTFd/CTFd.git CTFd',
      condition: '! git submodule status CTFd >/dev/null',
    },
    {
      name: 'add-ctfd-cloudfornt-plugin',
      exec: 'git submodule add https://github.com/raihalea/CTFd-CloudFront-signed-url.git CTFd-Plugins/cloudfront',
      condition: '! git submodule status CTFd-Plugins/cloudfront >/dev/null',
    },
    {
      name: 'copy-plugins',
      spawn: 'copy-plugins',
    },
  ],
});

cdkProject.addTask('copy-plugins', {
  exec: 'cp -r ./CTFd-Plugins/* ./CTFd/CTFd/plugins/',
});

cdkProject.addTask('pull-submodules', {
  exec: 'git submodule update --init --recursive',
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
