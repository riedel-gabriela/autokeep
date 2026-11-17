import nodemailer from 'nodemailer';

// Opt-in local mail capture only. No cloud email service is provisioned.
export async function sendLocalMail(email: string, subject: string, text: string) {
  const host = process.env.SMTP_HOST;
  if (!host) return;
  if (process.env.NODE_ENV === 'production' || !process.env.DYNAMODB_ENDPOINT) {
    throw new Error('LOCAL_SMTP_ONLY');
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 1025),
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 5000,
  });
  await transport.sendMail({
    from: 'AutoKeep <manutencao@autokeep.local>',
    to: email,
    subject,
    text,
  });
}
