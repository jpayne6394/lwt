import type { EmailMessage } from "./alert-service.ts";

export function createWebhookEmailSender(webhookUrl: string | undefined) {
  if (!webhookUrl) {
    return async (message: EmailMessage) => {
      console.warn(`Email webhook not configured: ${message.subject}`);
    };
  }

  return async (message: EmailMessage) => {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Email webhook failed with HTTP ${response.status}`);
    }
  };
}

