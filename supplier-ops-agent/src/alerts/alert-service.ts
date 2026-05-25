export type AlertSeverity = "info" | "warning" | "error";

export type AlertMessage = {
  id: string;
  severity: AlertSeverity;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  email: boolean;
};

export type RaiseAlertInput = Omit<AlertMessage, "id" | "createdAt">;

export type EmailMessage = {
  subject: string;
  body: string;
};

export type AlertServiceOptions = {
  sendEmail?: (message: EmailMessage) => Promise<void>;
};

export class AlertService {
  readonly #alerts: AlertMessage[] = [];
  readonly #sendEmail?: (message: EmailMessage) => Promise<void>;

  constructor(options: AlertServiceOptions = {}) {
    this.#sendEmail = options.sendEmail;
  }

  async raise(input: RaiseAlertInput): Promise<AlertMessage> {
    const existingIndex = this.#alerts.findIndex(
      (alert) => alert.kind === input.kind && alert.title === input.title && alert.body === input.body,
    );
    if (existingIndex !== -1) {
      this.#alerts.splice(existingIndex, 1);
    }

    const alert: AlertMessage = {
      ...input,
      id: `alert_${Date.now()}_${this.#alerts.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    this.#alerts.unshift(alert);

    if (alert.email && this.#sendEmail) {
      await this.#sendEmail({
        subject: `[Supplier Ops] ${alert.title}`,
        body: alert.body,
      });
    }

    return alert;
  }

  list(): AlertMessage[] {
    return [...this.#alerts];
  }
}

