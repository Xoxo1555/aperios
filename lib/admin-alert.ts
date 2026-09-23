import "server-only";
import { sendMail, isMailerConfigured } from "./mailer";

/**
 * I6 amendment 12: best-effort operator alert for payment anomalies.
 *
 * Used when the money mechanics are NOT provably safe automatically
 * (amount/currency mismatch, orphan Stripe event, definitive processing
 * failure that pushed an order to `refund_pending`…). The alert NEVER throws
 * and NEVER blocks the HTTP reply: the webhook's business decision is
 * already taken; this is only a human beep.
 *
 * Delivery: one e-mail to the Aperio admin inbox when SMTP is configured
 * (mail failures are swallowed), otherwise a tagged console line — the test
 * suite relies on the console fallback and must keep working with SMTP off.
 */

export interface AdminAlertInput {
  subject: string;
  body: string;
}

const ADMIN_ALERT_TO = process.env.ADMIN_ALERT_EMAIL ?? process.env.SMTP_USER;

export async function sendAdminAlert(input: AdminAlertInput): Promise<void> {
  const text = `[APERIO-ALERT]\n${input.subject}\n\n${input.body}`;
  try {
    console.log(text);
    if (isMailerConfigured() && ADMIN_ALERT_TO) {
      await sendMail({
        to: ADMIN_ALERT_TO,
        subject: `⚑ Aperio · ${input.subject}`,
        html: `<pre style="font-family: monospace; white-space: pre-wrap;">${input.body.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
        text: input.body,
      });
    }
  } catch {
    // Mail must never make the webhook fail or block the reply.
    console.log(`[APERIO-ALERT] envoi e-mail impossible (alerte deja logguee) : ${input.subject}`);
  }
}