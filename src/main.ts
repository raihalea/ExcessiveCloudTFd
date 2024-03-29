import { App } from 'aws-cdk-lib';
import { CloudTFdStack } from './lib/cloudtfd-stack';
import { awsConfig, globalConfig } from './lib/config/config';
import { GlobalStack } from './lib/global-stack';

const app = new App();
const ctfd = new CloudTFdStack(app, 'CloudTFdStack', {
  env: awsConfig,
  crossRegionReferences: true,
});

new GlobalStack(app, 'GlobalStack', {
  env: globalConfig,
  crossRegionReferences: true,
  bucketWithAccessKey: ctfd.bucketWithAccessKey,
  cloudfrontPublicKey: ctfd.cloudfrontPublicKey,
});

app.synth();