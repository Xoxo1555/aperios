import "server-only";
import { randomUUID } from "crypto";

/**
 * Real MVola API integration — the mobile-money wallet operated by Yas
 * (formerly Telma) in Madagascar. Flow: OAuth2 client-credentials token →
 * initiate an async "merchantpay" transaction → the customer confirms via
 * a USSD/app prompt on their phone → status is polled or confirmed via
 * callback.
 *
 * Required environment variables:
 *   MVOLA_CONSUMER_KEY, MVOLA_CONSUMER_SECRET   from the MVola developer portal
 *   MVOLA_PARTNER_NAME                          registered partner/merchant name
 *   MVOLA_MERCHANT_MSISDN                       merchant's MVola phone number
 *   MVOLA_BASE_URL                              https://api.mvola.mg (production)
 *                                                or the sandbox URL provided by MVola
 */

export function isMvolaConfigured(): boolean {
  return Boolean(
    process.env.MVOLA_CONSUMER_KEY &&
      process.env.MVOLA_CONSUMER_SECRET &&
      process.env.MVOLA_MERCHANT_MSISDN,
  );
}

function baseUrl(): string {
  return process.env.MVOLA_BASE_URL ?? "https://api.mvola.mg";
}

async function getAccessToken(): Promise<string> {
  const key = process.env.MVOLA_CONSUMER_KEY!;
  const secret = process.env.MVOLA_CONSUMER_SECRET!;
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${baseUrl()}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=EXT_INT_MVOLA_SCOPE",
  });
  if (!res.ok) throw new Error(`MVola: échec d'authentification (HTTP ${res.status}).`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export interface MvolaPaymentInput {
  amountAr: number;
  debitMsisdn: string; // customer's MVola number
  description: string;
  reference: string;
  callbackUrl: string;
}

export interface MvolaPaymentResult {
  serverCorrelationId: string;
  status: string;
}

/** Initiates a real MVola merchant-payment request (async, confirmed by the customer on their phone). */
export async function initiateMvolaPayment(input: MvolaPaymentInput): Promise<MvolaPaymentResult> {
  const token = await getAccessToken();
  const partnerName = process.env.MVOLA_PARTNER_NAME ?? "Aperio";
  const merchantMsisdn = process.env.MVOLA_MERCHANT_MSISDN!;
  const correlationId = randomUUID();

  const res = await fetch(
    `${baseUrl()}/mvola/mm/transactions/type/merchantpay/1.0.0/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "1.0",
        "X-CorrelationID": correlationId,
        UserLanguage: "FR",
        UserAccountIdentifier: `msisdn;${merchantMsisdn}`,
        partnerName,
        "X-Callback-URL": input.callbackUrl,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        amount: String(input.amountAr),
        currency: "Ar",
        descriptionText: input.description.slice(0, 50),
        requestDate: new Date().toISOString(),
        debitParty: [{ key: "msisdn", value: input.debitMsisdn }],
        creditParty: [{ key: "msisdn", value: merchantMsisdn }],
        metadata: [
          { key: "partnerName", value: partnerName },
          { key: "reference", value: input.reference },
        ],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MVola: transaction refusée (HTTP ${res.status}) ${body}`);
  }
  const data = (await res.json()) as { status: string; serverCorrelationId: string };
  return { serverCorrelationId: data.serverCorrelationId, status: data.status };
}

/** Polls the real-time status of a previously initiated MVola transaction. */
export async function getMvolaTransactionStatus(serverCorrelationId: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(
    `${baseUrl()}/mvola/mm/transactions/type/merchantpay/1.0.0/status/${serverCorrelationId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`MVola: impossible de récupérer le statut (HTTP ${res.status}).`);
  const data = (await res.json()) as { status: string };
  return data.status;
}

export interface MvolaDisbursementInput {
  amountAr: number;
  creditMsisdn: string; // recipient's MVola number
  reference: string;
}

/**
 * Initiates a real MVola disbursement (money-out / payout): the merchant
 * debits its own MVola account and credits the recipient's number. Throws
 * when not configured or the operator refuses, so the caller can mark the
 * payout failed and refund the balance.
 */
export async function disburseMvolaPayment(
  input: MvolaDisbursementInput,
): Promise<{ providerRef: string }> {
  const token = await getAccessToken();
  const partnerName = process.env.MVOLA_PARTNER_NAME ?? "Aperio";
  const merchantMsisdn = process.env.MVOLA_MERCHANT_MSISDN!;
  const correlationId = randomUUID();

  const res = await fetch(
    `${baseUrl()}/mvola/mm/transactions/type/disbursement/1.0.0/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "1.0",
        "X-CorrelationID": correlationId,
        UserLanguage: "FR",
        UserAccountIdentifier: `msisdn;${merchantMsisdn}`,
        partnerName,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        amount: String(input.amountAr),
        currency: "Ar",
        descriptionText: `Retrait Aperio ${input.reference}`.slice(0, 50),
        requestDate: new Date().toISOString(),
        debitParty: [{ key: "msisdn", value: merchantMsisdn }],
        creditParty: [{ key: "msisdn", value: input.creditMsisdn }],
        metadata: [
          { key: "partnerName", value: partnerName },
          { key: "reference", value: input.reference },
        ],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MVola: disbursement refusé (HTTP ${res.status}) ${body}`);
  }
  const data = (await res.json().catch(() => ({}))) as { serverCorrelationId?: string };
  return { providerRef: data.serverCorrelationId ?? correlationId };
}
