import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import * as oidc from 'openid-client';

const clientId = process.env.GOOGLE_CLIENT_ID;
const secretArn = process.env.GOOGLE_CLIENT_SECRET_ARN;

export const googleEnabled = Boolean(clientId && secretArn);
export const googleCallbackPath = '/api/auth/google/callback';

let configuration: Promise<oidc.Configuration> | undefined;
export function googleConfiguration() {
  configuration ??= loadConfiguration().catch((error) => {
    configuration = undefined;
    throw error;
  });
  return configuration;
}

async function loadConfiguration() {
  const secrets = new SecretsManagerClient({});
  const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }), {
    abortSignal: AbortSignal.timeout(4000),
  });
  if (!SecretString?.trim()) throw new Error('GOOGLE_CLIENT_SECRET_MISSING');
  const config = await oidc.discovery(
    new URL('https://accounts.google.com'),
    clientId!,
    SecretString.trim(),
    undefined,
    { timeout: 4 },
  );
  oidc.enableNonRepudiationChecks(config);
  return config;
}
