import "server-only";

/**
 * Real Orange Money Web Payment API integration (developer.orange.com).
 * Flow: OAuth2 client-credentials token → create a webpayment resource →
 * redirect the customer to the returned hosted `payment_url`. Orange then
 * calls back our `notif_url` webhook once the customer confirms on their
 * phone.
 *
 * Required environment variables:
 *   ORANGE_MONEY_AUTH_HEADER   Base64("client_id:client_secret") from the
 *                              Orange Developer console
 *   ORANGE_MONEY_MERCHANT_KEY  Merchant key issued for the Orange Money app
 *   ORANGE_MONEY_COUNTRY       Country code segment used in the API path
 *                              (e.g. "mg" for Madagascar)
 */

const TOKEN_URL = "https://api.orange.com/oauth/v3/token";

export function isOrangeMoneyConfigured(): boolean {
  return Boolean(
    process.env.ORANGE_MONEY_AUTH_HEADER &&
      process.env.ORANGE_MONEY_MERCHANT_KEY &&
      process.env.ORANGE_MONEY_COUNTRY,
  );
}

async function getAccessToken(): Promise<string> {
  const authHeader = process.env.ORANGE_MONEY_AUTH_HEADER!;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Orange Money: échec d'authentification (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export interface OrangeMoneyPaymentInput {
  orderId: string;
  amount: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  notifUrl: string;
  reference: string;
}

export interface OrangeMoneyPaymentResult {
  payToken: string;
  paymentUrl: string;
  notifToken: string;
}

/** Creates a real Orange Money web-payment session and returns the hosted payment URL. */
export async function createOrangeMoneyPayment(
  input: OrangeMoneyPaymentInput,
): Promise<OrangeMoneyPaymentResult> {
  const country = process.env.ORANGE_MONEY_COUNTRY!;
  const merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY!;
  const token = await getAccessToken();

  const res = await fetch(`https://api.orange.com/orange-money-webpay/${country}/v1/webpayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      merchant_key: merchantKey,
      currency: input.currency,
      order_id: input.orderId,
      amount: input.amount,
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      notif_url: input.notifUrl,
      lang: "fr",
      reference: input.reference,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Orange Money: paiement refusé (HTTP ${res.status}) ${body}`);
  }
  const data = (await res.json()) as { pay_token: string; payment_url: string; notif_token: string };
  return { payToken: data.pay_token, paymentUrl: data.payment_url, notifToken: data.notif_token };
}

export interface OrangeMoneyDisbursementInput {
  amountAr: number;
  recipientNumber: string; // recipient's Orange Money number (e.g. "0341234567")
  reference: string;
}

/**
 * Initiates a real Orange Money cash-out / disbursement (money-out / payout).
 * Best-effort: requires the Orange Money credentials, otherwise throws so the
 * caller marks the payout failed and refunds the balance. As with the other
 * operators, the exact disbursement contract depends on the merchant's
 * Orange developer agreement; a refused HTTP call is surfaced as an error.
 */
export async function disburseOrangeMoney(
  input: OrangeMoneyDisbursementInput,
): Promise<{ providerRef: string }> {
  const country = process.env.ORANGE_MONEY_COUNTRY!;
  const merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY!;
  const token = await getAccessToken();

  const res = await fetch(`https://api.orange.com/orange-money-webpay/${country}/v1/cashout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      merchant_key: merchantKey,
      currency: "Ar",
      amount: input.amountAr,
      reference: input.reference,
      payee_number: input.recipientNumber,
      description: `Retrait Aperio ${input.reference}`.slice(0, 50),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Orange Money: disbursement refusé (HTTP ${res.status}) ${body}`);
  }
  const data = (await res.json().catch(() => ({}))) as { pay_token?: string };
  return { providerRef: data.pay_token ?? input.reference };
}
