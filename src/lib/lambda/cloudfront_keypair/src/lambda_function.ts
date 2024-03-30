import { createPrivateKey, createPublicKey } from 'crypto';
import { SSM } from '@aws-sdk/client-ssm';
import { CdkCustomResourceEvent, CdkCustomResourceHandler, CdkCustomResourceResponse } from 'aws-lambda';

const ssm = new SSM();

async function getParameter(parameterName: string, decrypt: boolean): Promise<string> {
  const params = {
    Name: parameterName,
    WithDecryption: decrypt,
  };
  const response = await ssm.getParameter(params);
  return response.Parameter?.Value as string;
}

async function createPublicKeyPEM(parameter: string): Promise<string> {
  const privateKeyPEM = await getParameter(parameter, true);
  const privateKey = createPrivateKey(privateKeyPEM);
  const publicKey = createPublicKey(privateKey);
  const publicKeyPEM = publicKey.export({
    type: 'spki',
    format: 'pem',
  });
  return publicKeyPEM as string;
}

const sendResponse = async (
  event: CdkCustomResourceEvent,
  status: string,
  physicalResourceId: string,
  publicKey?: string,
): Promise<CdkCustomResourceResponse> => {
  const data = { PublicKeyEncoded: publicKey };

  return {
    Status: status,
    LogicalResourceId: event.LogicalResourceId,
    PhysicalResourceId: physicalResourceId,
    RequestId: event.RequestId,
    Data: data,
  };
};

export const handler: CdkCustomResourceHandler = async (event) => {
  console.log(event);

  const privatekeyParameterName = process.env.PRIVATEKEY_PARAMETER;

  if (privatekeyParameterName === undefined) {
    throw new Error('privatekeyParameterName is undefined');
  };

  const physicalResourceId =
    event.ResourceProperties.physicalResourceId ??
    'PublicKeyGenerator';

  let response: CdkCustomResourceResponse;
  try {
    const publicKey = await createPublicKeyPEM(privatekeyParameterName);

    switch (event.RequestType) {
      case 'Create':
        response = await sendResponse(event, 'SUCCESS', physicalResourceId, publicKey);
        break;
      case 'Update':
        response = await sendResponse(event, 'SUCCESS', physicalResourceId, publicKey);
        break;
      case 'Delete':
        response = await sendResponse(event, 'SUCCESS', physicalResourceId);
        break;
      default:
        response = await sendResponse(event, 'Failed', physicalResourceId);
        throw new Error(`Invalid RequestType: ${event}`);
    }
    return response;
  } catch (error) {
    response = await sendResponse(event, 'Failed', physicalResourceId);
    throw error;
    return response;
  }
};
