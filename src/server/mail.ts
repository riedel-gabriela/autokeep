import nodemailer from 'nodemailer';
import { z } from 'zod';
import { config } from './config.js';

const smtp = z
  .object({
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().default(1025),
  })
  .parse(process.env);
const transport = nodemailer.createTransport({
  host: smtp.SMTP_HOST,
  port: smtp.SMTP_PORT,
  secure: false,
  ignoreTLS: true,
  connectionTimeout: 5000,
});
export async function sendMail(email: string, subject: string, text: string) {
  // Transporte exclusivamente local: o Mailpit captura mensagens, sem enviá-las à internet.
  await transport.sendMail({
    from: 'AutoKeep <cuidados@autokeep.local>',
    to: email,
    subject,
    text,
  });
}
export async function sendInvitation(email: string, token: string) {
  const url = `${config.APP_ORIGIN}/#invite=${token}`;
  try {
    await sendMail(
      email,
      'Seu convite para o AutoKeep',
      `Você recebeu um convite para acompanhar uma frota.\n\n${url}\n\nVálido por sete dias. Se já tem uma conta, entre para aceitar.`,
    );
  } catch {
    console.error(
      JSON.stringify({ event: 'invitation_mail_failed', code: 'LOCAL_SMTP_UNAVAILABLE' }),
    );
  }
  return url;
}
