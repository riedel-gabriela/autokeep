function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

export const config = {
  tableName: required("TABLE_NAME"),
  senderEmail: required("SENDER_EMAIL"),
  notificationTopicArn: required("NOTIFICATION_TOPIC_ARN"),
};
