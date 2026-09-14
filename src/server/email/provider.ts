import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/server/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tag?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

/** Development/test driver: writes every email to var/mail and appends an index line to mailbox.jsonl. */
class LogEmailProvider implements EmailProvider {
  readonly name = "log";
  constructor(private readonly directory = path.resolve(process.cwd(), "var/mail")) {}

  async send(message: EmailMessage) {
    await mkdir(this.directory, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = message.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const file = `${id}-${slug}.html`;
    await writeFile(path.join(this.directory, file), message.html, "utf8");
    const links = Array.from(message.html.matchAll(/href="([^"]+)"/g), (match) => match[1].replaceAll("&amp;", "&"));
    await appendFile(
      path.join(this.directory, "mailbox.jsonl"),
      `${JSON.stringify({ id, at: new Date().toISOString(), to: message.to, subject: message.subject, tag: message.tag, file, links, text: message.text })}\n`,
      "utf8",
    );
    if (process.env.NODE_ENV === "development") {
      console.info(`[email:log] → ${message.to} · ${message.subject} · var/mail/${file}`);
    }
    return { id };
  }
}

class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private transport: Promise<import("nodemailer").Transporter> | undefined;

  private getTransport() {
    this.transport ??= import("nodemailer").then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      }),
    );
    return this.transport;
  }

  async send(message: EmailMessage) {
    const transport = await this.getTransport();
    const info = await transport.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    });
    return { id: info.messageId ?? null };
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  async send(message: EmailMessage) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo,
        tags: message.tag ? [{ name: "category", value: message.tag.replace(/[^a-zA-Z0-9_-]/g, "_") }] : undefined,
      }),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
    const body = (await response.json()) as { id?: string };
    return { id: body.id ?? null };
  }
}

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!provider) {
    switch (env.EMAIL_DRIVER) {
      case "smtp":
        provider = new SmtpEmailProvider();
        break;
      case "resend":
        provider = new ResendEmailProvider();
        break;
      default:
        provider = new LogEmailProvider();
    }
  }
  return provider;
}

/** Test hook */
export function setEmailProvider(next: EmailProvider | undefined) {
  provider = next;
}
