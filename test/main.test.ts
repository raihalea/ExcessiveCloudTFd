import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudTFdStack } from '../src/lib/cloudtfd-stack';
import { awsConfig, globalConfig } from '../src/lib/config/config';
import { GlobalStack } from '../src/lib/global-stack';


test('Snapshot', () => {
  const app = new App();
  const ctfdStack = new CloudTFdStack(app, 'CloudTFdStack', {
    env: awsConfig,
    crossRegionReferences: true,
  });

  const globalStack = new GlobalStack(app, 'GlobalStack', {
    env: globalConfig,
    crossRegionReferences: true,
    contentsBucket: ctfdStack.contentsBucket,
    cloudfrontPublicKey: ctfdStack.cloudfrontPublicKey,
  });
  const ctfd_template = Template.fromStack(ctfdStack);
  const globalStack_template = Template.fromStack(globalStack);
  expect(ctfd_template.toJSON()).toMatchSnapshot();
  expect(globalStack_template.toJSON()).toMatchSnapshot();
});