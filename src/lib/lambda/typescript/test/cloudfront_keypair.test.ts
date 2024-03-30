import { generateKeyPairSync } from 'crypto';
import { Context, CdkCustomResourceResponse } from 'aws-lambda';
import { handler } from '../src/cloudfront_keypair/lambda_function';


function generatePrivateKeyPEM() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
}

jest.mock('@aws-sdk/client-ssm', () => ({
  SSM: jest.fn().mockImplementation(() => ({
    getParameter: jest.fn().mockImplementation(() => Promise.resolve({
      Parameter: { Value: generatePrivateKeyPEM() },
    })),
  })),
}));

const mockContext: Partial<Context> = {};

describe('Lambda Handler', () => {
  beforeAll(() => {
    process.env.PRIVATEKEY_PARAMETER = 'TestPrivateKeyParameter';
  });

  afterAll(() => {
    delete process.env.PRIVATEKEY_PARAMETER;
  });

  it('should generate a public key from a private key parameter', async () => {
    const event = {
      RequestType: 'Create',
      ResourceProperties: {},
      LogicalResourceId: 'TestResourceId',
      RequestId: 'TestRequestId',
    };

    const response = await handler(event as any, mockContext as Context, () => {}) as CdkCustomResourceResponse;

    expect(response).toHaveProperty('Status', 'SUCCESS');

    if (response.Data) {
      expect(response.Data.PublicKeyEncoded).toContain('-----BEGIN PUBLIC KEY-----');
      expect(response.Data.PublicKeyEncoded).toContain('-----END PUBLIC KEY-----');
    } else {
      throw new Error('Response does not have a Data property.');
    }
  });
});
