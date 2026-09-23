import "server-only";
import nodemailer from "nodemailer";

/**
 * Real SMTP mailer for Aperio. Configured via Gmail (or any SMTP provider)
 * environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (optional SMTP_SECURE)
 *
 * There is deliberately NO passive console fallback: if SMTP isn't configured
 * or delivery fails, sendMail() throws a MailDeliveryError so the calling API
 * route returns an explicit error instead of simulating a successful send.
 */

export class MailDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MailDeliveryError";
  }
}

export function isMailerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
  );
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!isMailerConfigured()) {
    throw new MailDeliveryError(
      "SMTP n'est pas configuré. Renseignez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (et SMTP_FROM) dans .env pour activer l'envoi des e-mails.",
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
  }
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/* ---------------- In-memory test sink ---------------- */
/* Enabled ONLY by APERIO_MAILER_SINK=1 (set by the verification harness
 * before importing this module). Mails never leave the process and the
 * code is never logged — captureCode() extracts it from the captured HTML
 * so a test can assert delivery without any console output of the code. */

const mailSink: Array<SendMailInput & { at: number }> = [];

export function clearMailSink(): void {
  mailSink.length = 0;
}

export function capturedMails(): ReadonlyArray<SendMailInput & { at: number }> {
  return mailSink.slice();
}

/** Extracts the 6-digit code from the last captured mail (optionally filtered
 *  by recipient / subject fragment). Throws when nothing matches. */
export function captureCode(filter?: { to?: string; subject?: string }): string {
  const mails = filter
    ? mailSink.filter(
        (m) =>
          (filter.to === undefined || m.to === filter.to) &&
          (filter.subject === undefined || m.subject.includes(filter.subject)),
      )
    : mailSink;
  const last = mails[mails.length - 1];
  if (!last) throw new MailDeliveryError("captureCode: aucun e-mail capturé.");
  const match = /letter-spacing: 10px[^>]*>\s*(\d{6})\s*<\/div>/.exec(last.html);
  if (!match) throw new MailDeliveryError("captureCode: code introuvable dans l'e-mail capturé.");
  return match[1];
}

/**
 * Sends an email over SMTP. Throws a MailDeliveryError when the mailer is not
 * configured or when the SMTP server rejects/errors on delivery — callers must
 * surface this as an explicit failure instead of pretending the mail was sent.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  if (process.env.APERIO_MAILER_SINK === "1") {
    mailSink.push({ ...input, at: Date.now() });
    return;
  }
  const t = getTransporter();
  const from =
    process.env.SMTP_FROM?.trim() ||
    `Aperio Galerie <${process.env.SMTP_USER}>`;
  try {
    await t.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, " "),
    });
  } catch (err) {
    throw new MailDeliveryError(
      `Échec de l'envoi de l'e-mail via SMTP : ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/**
 * En-tête e-mail officiel Aperio — reprend le <Logo /> (médaillon #141416, bordure #F59E0B, point #D97706 sur bande #0A0A0B)
 * pour garantir la cohérence visuelle entre l'app et les e-mails transactionnels.
 */
function aperioEmailHeaderHtml(): string {
  return `
    <div style="background: #0A0A0B; padding: 20px 24px; text-align: center; border-radius: 12px 12px 0 0; border-bottom: 3px solid #D97706;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: middle; padding-right: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid #F59E0B; background: #141416; text-align: center; line-height: 40px;">
              <span style="color: #F59E0B; font-size: 18px; vertical-align: middle;">&#9673;</span>
            </div>
          </td>
          <td style="vertical-align: middle; font-family: Arial, sans-serif; font-weight: 800; font-size: 22px; letter-spacing: 0.08em; color: #FFFFFF; text-transform: uppercase;">
            APERIO<span style="color: #D97706;">.</span>
          </td>
        </tr>
      </table>
      <div style="margin-top: 8px; font-family: Arial, sans-serif; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #F59E0B;">Galerie d'art &amp; photographie</div>
    </div>
  `;
}

export function verificationEmailHtml(code: string, name: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #F5F2EB; border: 1px solid #D6CEC0; border-radius: 12px; overflow: hidden;">
      ${aperioEmailHeaderHtml()}
      <div style="padding: 28px 32px; background: #F5F2EB;">
        <p style="color: #1C1917; font-size: 15px; margin: 0 0 10px;">Bonjour ${name},</p>
        <p style="color: #57534E; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">Voici votre code de vérification pour activer votre compte Aperio :</p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 10px; color: #D97706; text-align: center; padding: 16px 0; background: #FFFFFF; border: 1px solid #D6CEC0; border-radius: 10px;">${code}</div>
        <p style="color: #78716C; font-size: 13px; margin: 16px 0 0;">Ce code expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      </div>
      <div style="background: #141416; padding: 14px 24px; text-align: center;">
        <span style="font-family: Arial, sans-serif; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #F59E0B;">Aperio &mdash; Atelier Ivoire</span>
      </div>
    </div>
  `;
}

export function passwordResetEmailHtml(code: string, name: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #F5F2EB; border: 1px solid #D6CEC0; border-radius: 12px; overflow: hidden;">
      ${aperioEmailHeaderHtml()}
      <div style="padding: 28px 32px; background: #F5F2EB;">
        <p style="color: #1C1917; font-size: 15px; margin: 0 0 10px;">Bonjour ${name},</p>
        <p style="color: #57534E; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">Voici votre code de réinitialisation de mot de passe Aperio :</p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 10px; color: #D97706; text-align: center; padding: 16px 0; background: #FFFFFF; border: 1px solid #D6CEC0; border-radius: 10px;">${code}</div>
        <p style="color: #78716C; font-size: 13px; margin: 16px 0 0;">Ce code expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail sans risque — votre mot de passe ne sera pas modifié.</p>
      </div>
      <div style="background: #141416; padding: 14px 24px; text-align: center;">
        <span style="font-family: Arial, sans-serif; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #F59E0B;">Aperio &mdash; Atelier Ivoire</span>
      </div>
    </div>
  `;
}
