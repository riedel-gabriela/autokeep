import assert from 'node:assert/strict';
import test from 'node:test';
import nodemailer from 'nodemailer';
import { sendLocalMail } from '../src/server/mail.js';

test('convites por SMTP exigem ambiente local e usam o transporte configurado', async (t) => {
  const sendMail = t.mock.fn(async () => ({}));
  const transport = t.mock.method(nodemailer, 'createTransport', () => ({ sendMail }));
  delete process.env.SMTP_HOST;
  await sendLocalMail('motorista@example.com', 'Convite', 'Abra o link');
  assert.equal(transport.mock.callCount(), 0);
  process.env.SMTP_HOST = 'mail';
  process.env.NODE_ENV = 'production';
  await assert.rejects(
    sendLocalMail('motorista@example.com', 'Convite', 'Abra o link'),
    /LOCAL_SMTP_ONLY/,
  );
  process.env.NODE_ENV = 'test';
  delete process.env.DYNAMODB_ENDPOINT;
  await assert.rejects(
    sendLocalMail('motorista@example.com', 'Convite', 'Abra o link'),
    /LOCAL_SMTP_ONLY/,
  );
  process.env.DYNAMODB_ENDPOINT = 'http://db:8000';
  delete process.env.SMTP_PORT;
  await sendLocalMail('motorista@example.com', 'Convite', 'Abra o link');
  assert.deepEqual(transport.mock.calls[0].arguments[0], {
    host: 'mail',
    port: 1025,
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 5000,
  });
  assert.deepEqual(sendMail.mock.calls[0].arguments[0], {
    from: 'AutoKeep <manutencao@autokeep.local>',
    to: 'motorista@example.com',
    subject: 'Convite',
    text: 'Abra o link',
  });
  process.env.SMTP_PORT = '1026';
  await sendLocalMail('motorista@example.com', 'Convite', 'Abra o link');
  assert.equal(transport.mock.calls[1].arguments[0].port, 1026);
});
