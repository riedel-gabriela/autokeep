import assert from 'node:assert/strict';
import test from 'node:test';
import { developmentUrls } from '../scripts/development-urls.mjs';

test('desenvolvimento local ignora origem cloud e secrets herdados', () => {
  assert.deepEqual(
    developmentUrls({
      APP_ORIGIN: 'https://production.example',
      AWS_SECRET_ACCESS_KEY: 'fake-secret',
    }),
    {
      appOrigin: 'http://localhost:8080',
      mailpitUrl: 'http://localhost:8025',
    },
  );
});

test('Codespaces deriva portas distintas sem carregar secrets', () => {
  assert.deepEqual(
    developmentUrls({
      CODESPACES: 'true',
      CODESPACE_NAME: 'demo-space-123',
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
      AWS_ACCESS_KEY_ID: 'fake-key',
    }),
    {
      appOrigin: 'https://demo-space-123-8080.app.github.dev',
      mailpitUrl: 'https://demo-space-123-8025.app.github.dev',
    },
  );
});

test('Codespaces não cai silenciosamente em localhost se as variáveis faltam', () => {
  assert.throws(() => developmentUrls({ CODESPACES: 'true' }));
  assert.throws(() =>
    developmentUrls({
      CODESPACES: 'true',
      CODESPACE_NAME: 'demo',
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev/path',
    }),
  );
});
