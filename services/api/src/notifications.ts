import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { config } from "./config.js";

const ses = new SESv2Client({});
const sns = new SNSClient({});

export async function sendInvitation(email: string, companyName: string, token: string, applicationUrl: string): Promise<void> {
  const link = `${applicationUrl}/#invite=${encodeURIComponent(token)}`;
  await ses.send(new SendEmailCommand({
    FromEmailAddress: config.senderEmail,
    Destination: { ToAddresses: [email] },
    Content: { Simple: {
      Subject: { Data: "Convite para o AutoKeep", Charset: "UTF-8" },
      Body: { Text: { Data: `Você foi convidado para a organização ${companyName}. Abra ${link} para aceitar. O convite expira em 7 dias.`, Charset: "UTF-8" } },
    } },
  }));
}

export async function sendAlert(recipients: string[], message: string): Promise<void> {
  await Promise.all([
    ...recipients.map((email) => ses.send(new SendEmailCommand({
      FromEmailAddress: config.senderEmail,
      Destination: { ToAddresses: [email] },
      Content: { Simple: {
        Subject: { Data: "Alerta de manutenção AutoKeep", Charset: "UTF-8" },
        Body: { Text: { Data: message, Charset: "UTF-8" } },
      } },
    }))),
    sns.send(new PublishCommand({ TopicArn: config.notificationTopicArn, Message: message, Subject: "AutoKeep" })),
  ]);
}
