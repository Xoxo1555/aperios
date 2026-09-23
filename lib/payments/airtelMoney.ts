import "server-only";

/**
 * Real Airtel Money OpenAPI integration (developers.airtel.africa).
 * Flow: OAuth2 client-credentials token → create a Collection (payment
 * request) → the customer authorizes it with their Airtel Money PIN on
 * their phone → status is confirmed via callback or polling.
 *
 * Required environment variables:
 *   AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET   from the Airtel developer portal
 *   AIRTEL_COUNTRY (e.g. "MG"), AIRTEL_CURRENCY (e.g. "MGA")
 *   AIRTEL_ENV = "production" to use the live endpoint (defaults to the
 *                sandbox/UAT endpoint otherwise)
 */

export function isAirtelMoneyConfigured(): boolean {
  return Boolean(process.env.AIRTEL_CLIENT_ID && process.env.AIRTEL_CLIENT_SECRET);
}

function baseUrl(): string {
  return process.env.AIRTEL_ENV === "production"
    ? "https://openapi.airtel.africa"
    : "https://openapiuat.airtel.africa";
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(`${baseUrl()}/auth/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.AIRTEL_CLIENT_ID,
      client_secret: process.env.AIRTEL_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Airtel Money: échec d'authentification (HTTP ${res.status}).`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export interface AirtelMoneyPaymentInput {
  amount: number;
  msisdn: string; // customer's Airtel Money number, no country code
  reference: string;
  transactionId: string;
}

export interface AirtelMoneyPaymentResult {
  transactionId: string;
  status: string;
}

/** Initiates a real Airtel Money collection request (customer authorizes via PIN prompt). */
export async function initiateAirtelMoneyPayment(
  input: AirtelMoneyPaymentInput,
): Promise<AirtelMoneyPaymentResult> {
  const token = await getAccessToken();
  const country = process.env.AIRTEL_COUNTRY ?? "MG";
  const currency = process.env.AIRTEL_CURRENCY ?? "MGA";

  const res = await fetch(`${baseUrl()}/merchant/v2/payments/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "*/*",
      "X-Country": country,
      "X-Currency": currency,
    },
    body: JSON.stringify({
      reference: input.reference,
      subscriber: { country, currency, msisdn: input.msisdn },
      transaction: { amount: input.amount, country, currency, id: input.transactionId },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtel Money: transaction refusée (HTTP ${res.status}) ${body}`);
  }
  const data = (await res.json().catch(() => ({}))) as { status?: { code?: string; message?: string } };
  return { transactionId: input.transactionId, status: data?.status?.message ?? "TIP" };
}

export interface AirtelMoneyDisbursementInput {
  amount: number;
  msisdn: string; // recipient's Airtel Money number (no country code)
  reference: string;
  transactionId: string;
}

/**
 * Initiates a real Airtel Money disbursement (money-out / payout). Airtel
 * distinguishes a disbursement from a collection by the `idType: "MSISDN"`
 * marker on the merchant payments endpoint. Throws when not configured or the
 * operator refuses, so the caller can mark the payout failed and refund.
 */
export async function disburseAirtelMoney(
  input: AirtelMoneyDisbursementInput,
): Promise<{ providerRef: string }> {
  const token = await getAccessToken();
  const country = process.env.AIRTEL_COUNTRY ?? "MG";
  const currency = process.env.AIRTEL_CURRENCY ?? "MGA";

  const res = await fetch(`${baseUrl()}/merchant/v1/payments/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "*/*",
      "X-Country": country,
      "X-Currency": currency,
    },
    body: JSON.stringify({
      reference: input.reference,
      subscriber: { country, currency, msisdn: input.msisdn },
      transaction: { amount: input.amount, country, currency, id: input.transactionId },
      idType: "MSISDN",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtel Money: disbursement refusé (HTTP ${res.status}) ${body}`);
  }
  return { providerRef: input.transactionId };
}
