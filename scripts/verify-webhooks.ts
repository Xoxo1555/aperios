/**
 * Vérification I6 ÉTAPE 1 — chaîne de confirmation de paiement côté webhook.
 *
 * Les webhooks Stripe et Mobile Money sont exercés EN DIRECT (via NextRequest
 * + les VRAIS handlers de production sous app/api/webhooks/ — aucun serveur
 * n'est lancé, aucun réseau ne sort.
 *
 * Boucliers de test (SETUP) :
 *  - secrets factices (STRIPE_SECRET_KEY=sk_test_dummy,
 *    STRIPE_WEBHOOK_SECRET=whsec_test_stripe, WEBHOOK_SECRET + tokens
 *    Orange/MVola/Airtel) posés AVANT le moindre appel de handler ;
 *  - STUB RÉSEAU GLOBAL : https/http request/get et fetch -> THROW si un
 *    handler tente de sortir vers api.stripe.com ou tout hôte externe (le
 *    test échouerait aussitôt) ;
 *  - refus de setStripeRefundOverride en NODE_ENV=production GARANTI par le
 *    lib (assertLocalDatabase refuse déjà production) ; le faux client de
 *    remboursement est installé via setStripeRefundOverride et ne touche
 *    jamais Stripe ;
 *  - mailer neutralisé (pas de SMTP_Host) : sendAdminAlert se dégrade en log.
 *
 * Cas couverts (étape 1) :
 *   A. session.completed montant ≠ attendu  -> refund_pending(amount_mismatch),
 *      AUCUN remboursement automatique, réponse 200.
 *   B. session.completed devise ≠ attendue   -> refund_pending(currency_mismatch).
 *   C. session.completed payment_status≠paid -> 200, commande PENDING, paymentRef
 *      enregistré pour l'événement async.
 *   D. async_payment_succeeded (après C)     -> finalisée paid + re-validation
 *      du montant, 1 cert, 1 ledger, stock -1.
 *   E. DERNIÈRE PIÈCE, 2 événements concurrents (stock=1) : exactement UNE
 *      commande paid, l'AUTRE refund_pending->refunded, UN SEUL appel de
 *      remboursement (DeltaReFund = 1), les deux réponses 200.
 *   F. Échec de l'API de remboursement : 500, event reste "received" ; replay
 *      du MÊME event -> 200, refunded avec refund_id, un seul flip final.
 *   G. Replay d'un event déjà "processed"  -> 200 no-op (aucun double effet,
 *      aucun nouvel appel de remboursement).
 *   H. Événement orphelin                  -> 200, webhook_events unmatched.
 *   I. Signature invalide / mauvaise clé   -> 400 (avant tout effet).
 *   J. Admin /confirm (helper partagé handleConfirmedPayment, MÊME chemin que
 *      les webhooks) : succès -> finalized ; stock épuisé -> refunded + raison.
 *   K. Webhook MVola succès -> paid, rejeu MÊME event -> 200 no-op ; échec
 *      définitif Orange -> refund_pending SANS remboursement auto (skipRefund).
 *   L. Dépôt WLD via Stripe : montant conforme -> crédit ; montant différent
 *      -> aucun crédit + alerte.
 *
 * Cas couverts (étape 2) :
 *   M. charge.refunded COMPLET d'une commande finalisée -> clawback vendeur +
 *      certificats révoqués + entitlements supprimés + stock INCHANGÉ ; rejeu
 *      du même event.id -> 200 sans double effet (toujours UNE ligne RFD).
 *   N. charge.refunded sur refund_pending (jamais créditée) -> refunded SANS
 *      clawback (aucune ligne RFD, aucun certificat, solde vendeur inchangé).
 *   O. Litiges : dispute.created -> disputed_at + alerte SANS clawback ;
 *      dispute.closed won -> drapeau levé, vente conservée, Δrefund=0 ;
 *      dispute.closed LOST -> clawback (refunded + RFD + cert révoqué), aucun
 *      appel refundStripeCharge (Stripe a déjà débité).
 *   P. Solde vendeur NÉGATIF accepté après clawback (dette assumée) + refus
 *      propre d'un achat wallet insuffisant (OrderError 402, ordre pending).
 *   Q. charge.refunded PARTIEL -> statut CONSERVÉ, alerte, aucun clawback.
 *   R. PUT /api/admin/orders/[orderNumber] (session admin forgée JWT) :
 *      transitions touchant paid|refund_pending|refunded -> 422
 *      BLOCKED_MONEY_TRANSITION ; hors tableau -> 422 INVALID_TRANSITION ;
 *      couples déclarés (pending/cancelled + progression) -> 200 ; statut
 *      inconnu -> 400 ; non-admin -> 401.
 *   S. POST /api/payouts (session photographe forgée) : réservation atomique,
 *      échec opérateur (stub réseau) -> payout failed, solde REMBOURSÉ,
 *      ledger sync failed ; GET /api/payouts (amount::text) ; solde
 *      insuffisant -> 400 ; POST admin retry -> re-réservation puis refund.
 *
 * Cas couverts (étape 3) :
 *   T. Solde vendeur NÉGATIF (-24.92 €) : lectures dashboard + /api/me -> 200 ;
 *      AUCUN retrait (payout -> 400 sans réservation, wallet -> OrderError 402,
 *      aucune commande pending) ; puis vente créditée -> solde net 15.00.
 *   U. Commande DIGITALE : entitlement créé + téléchargement réel -> 200 (fichier
 *      HD dans storage/hd) ; charge.refunded -> refunded + entitlement SUPPRIMÉ
 *      + download -> 403 (licence révoquée) + UNE ligne RFD (clawback) ; rejeu sûr.
 *   V. charge.refunded CUMULÉ : partiel -> statut CONSERVÉ (paid, aucun clawback) ;
 *      cumul total -> refunded, clawback UNE seule fois ; rejeu sûr.
 *   W. POST /api/admin/orders/[orderNumber]/retry-refund : sans session -> 401,
 *      non-admin -> 403 ; retry éligible -> refunded via fake + idempotency
 *      refund-<orderNumber> (Δ=1, JAMAIS double) ; déjà remboursée -> 200
 *      already-refunded (Δ=0) ; raison inéligible -> 422 REFUND_REASON_NOT_ELIGIBLE ;
 *      sans paymentRef -> 409 MISSING_PAYMENT_REF.
 *   X. ÉTAPE 3 Mobile Money : échec définitif -> pending CANCELLED (aucun crédit,
 *      aucun remboursement) + rejeu no-op ; succès TARDIF sur commande annulée ->
 *      refund_pending(order_cancelled_after_payment) + alerte (Δrefund=0) ; échec
 *      APRÈS paiement -> 200, vente JAMAIS annulée, solde inchangé ; statut
 *      transitoire (pending) -> 200 sans effet ; dépôt WLD échoué -> failed sans
 *      crédit ; orange/mvola/airtel distincts (eventId provider+ref+status).
 *
 * Usage (le `server-only` nécessite le shim NODE_PATH + la condition
 * react-server ; route handlers importés dans le process de test) :
 *   $env:NODE_PATH='<temp>\opencode'
 *   $env:DATABASE_URL='postgresql://user:pass@localhost:5432/app_db'
 *   npx tsx --conditions react-server scripts/verify-webhooks.ts
 */
import "server-only";

/* ------------------------------------------------------------------ */
/*  1) Env factices AVANT tout appel de handler (lectures à l'exécution) */
/* ------------------------------------------------------------------ */
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_stripe";
process.env.WEBHOOK_SECRET = "whsec_test_mm";
process.env.ORANGE_MONEY_WEBHOOK_TOKEN = "token_orange_test";
process.env.MVOLA_WEBHOOK_TOKEN = "token_mvola_test";
process.env.AIRTEL_WEBHOOK_TOKEN = "token_airtel_test";
process.env.JWT_SECRET = "verify_webhook_jwt_secret";
/* Pas de SMTP_* : sendAdminAlert se dégrade en console.log. */
delete process.env.SMTP_HOST;

import { and, eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "../db";
import {
  certificates,
  entitlements,
  orderItems,
  orders,
  payouts,
  photos,
  users,
  walletTransactions,
  webhookEvents,
} from "../db/schema";
import type { OrderStatus, RefundReason } from "../db/schema";
import {
  createDigitalOrder,
  createPendingOrder,
  handleConfirmedPayment,
  markOrderRefundPending,
  OrderError,
  payOrderWithWallet,
} from "../lib/orders";
import { createWalletDepositTx } from "../lib/wallet";
import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { signSessionToken } from "../lib/session";
import {
  setStripeRefundOverride,
  clearStripeRefundOverride,
} from "../lib/payments/stripe";
import { NextRequest } from "next/server";
import { assertLocalDatabase } from "./lib/assert-local-db";

/* Refuse une cible non locale AVANT toute connexion. */
assertLocalDatabase();

/* ------------------------------------------------------------------ */
/*  2) STUB RÉSEAU GLOBAL : aucun octet ne peut sortir de la machine.   */
/* ------------------------------------------------------------------ */
let networkViolation: string | null = null;
const forbidNetwork = (label: string) => {
  return (...args: unknown[]) => {
    networkViolation = `${label}: ${String(args[0] ?? "")}`;
    const err = new Error(`RÉSEAU EXTERNE INTERDIT dans verify-webhooks — ${label} ${String(args[0] ?? "")}`);
    err.name = "NetworkStubViolation";
    throw err;
  };
};
(globalThis as { fetch: unknown }).fetch = forbidNetwork("fetch") as typeof fetch;
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const nodeHttps = _require("node:https");
const nodeHttp = _require("node:http");
nodeHttps.request = forbidNetwork("https.request") as never;
nodeHttps.get = forbidNetwork("https.get") as never;
nodeHttp.request = forbidNetwork("http.request") as never;
nodeHttp.get = forbidNetwork("http.get") as never;

/* ------------------------------------------------------------------ */
/*  3) Faux client de remboursement Stripe (jamais d'API réelle).       */
/* ------------------------------------------------------------------ */
let refundCalls = 0;
let refundFailures = 0;
setStripeRefundOverride(async (input) => {
  refundCalls++;
  if (refundFailures > 0) {
    refundFailures--;
    throw new Error(`[fake-refund] API Stripe indisponible (essai ${input.idempotencyKey})`);
  }
  return { refundId: `re_fake_${input.orderNumber}` };
});

const stripeSig = new Stripe("sk_test_dummy");

/* ------------------------------------------------------------------ */
/*  3bis) Session admin/photographe forgée (JWT réel signé + cookie    */
/*        simulé via next/headers — lib/auth lit cookies() au moment   */
/*        de l'appel, patch CJS vivant, comme le stub réseau).         */
/* ------------------------------------------------------------------ */
const _session_sink = { token: null as string | null };
const _nextHeaders = _require("next/headers");
_nextHeaders.cookies = async () => ({
  get: (name: string) =>
    _session_sink.token && name === "aperio_session"
      ? { name, value: _session_sink.token }
      : undefined,
}) as never;

const forgeSession = async (
  u: { id: number; name: string; email: string; role: "admin" | "photographer" | "buyer" },
) => {
  _session_sink.token = await signSessionToken({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: null,
    coverImage: null,
    bio: null,
    location: null,
    donationLink: null,
    instagram: null,
  });
};
const clearSession = () => {
  _session_sink.token = null;
};

const stamp = Date.now().toString(36);
const PASSWORD_HASH = "verify-not-used";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond === false || !cond) {
    failures++;
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}
const log = (msg: string) => console.log(`[verify-webhooks] ${msg}`);

async function seededEventId(kind: string, i = 1): Promise<{ eventId: string }> {
  return { eventId: `evt_${kind}_${stamp}_${i}` };
}

async function postStripe(opts: {
  eventId: string;
  type: string;
  object: Record<string, unknown>;
  secret?: string | null;
  headerString?: "missing" | "garbage" | "wrong-secret" | undefined;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const event = {
    id: opts.eventId,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: opts.type,
    data: { object: opts.object },
  };
  const payload = JSON.stringify(event);
  let header: string | null;
  if (opts.headerString === "missing") header = null;
  else if (opts.headerString === "wrong-secret")
    header = stripeSig.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_ANOTHER_SECRET",
    });
  else
    header = stripeSig.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(header ? { "stripe-signature": header } : {}),
  };
  if (opts.headerString === "garbage") headers["stripe-signature"] = "t=123,v1=deadbeef";
  const req = new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers,
    body: payload,
  });
  const { POST } = await import("../app/api/webhooks/stripe/route");
  const res = await POST(req);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

function makeSession(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `cs_${stamp}`,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_total: 4990,
    currency: "eur",
    payment_intent: `pi_${stamp}`,
    client_reference_id: "APR-2026-000001",
    metadata: {},
    ...over,
  };
}

async function postMM(opts: {
  provider: "orange-money" | "mvola" | "airtel-money";
  body: Record<string, unknown>;
  token?: string | null;
  header?: "missing" | "wrong" | "bearer" | null;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.header === "missing") {
    /* rien */
  } else if (opts.header === "wrong") {
    headers["x-webhook-token"] = "token_INCORRECT";
  } else if (opts.header === "bearer") {
    headers.Authorization = `Bearer ${opts.token ?? "token_airtel_test"}`;
  } else {
    headers["x-webhook-token"] = opts.token ?? "whsec_should_not_use";
  }
  const req = new NextRequest(`http://localhost/api/webhooks/${opts.provider}`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body),
  });
  const route = opts.provider === "orange-money"
    ? "../app/api/webhooks/orange-money/route"
    : opts.provider === "mvola"
      ? "../app/api/webhooks/mvola/route"
      : "../app/api/webhooks/airtel-money/route";
  const { POST } = await import(route);
  const res = await POST(req);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

async function orderByNumber(orderNumber: string) {
  const [row] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  return row ?? null;
}

async function certsForOrder(orderId: number) {
  const items = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return 0;
  const rows = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(inArray(certificates.orderItemId, items.map((i) => i.id)));
  return rows.length;
}

async function countLedger(reference: string) {
  const rows = await db.select({ id: walletTransactions.id }).from(walletTransactions).where(eq(walletTransactions.reference, reference));
  return rows.length;
}

async function webhookStatus(provider: "stripe" | "mvola" | "orange_money" | "airtel_money", eventId: string) {
  const [row] = await db
    .select({ status: webhookEvents.status, error: webhookEvents.error })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)))
    .limit(1);
  return row ?? null;
}

async function balance(userId: number): Promise<number> {
  const [row] = await db
    .select({ b: users.availableBalance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return parseFloat(row?.b ?? "0");
}

async function revokedCertsForOrder(orderId: number): Promise<number> {
  const items = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return 0;
  const rows = await db
    .select({ revokedAt: certificates.revokedAt })
    .from(certificates)
    .where(inArray(certificates.orderItemId, items.map((i) => i.id)));
  return rows.filter((r) => r.revokedAt != null).length;
}

async function callRoute(
  routePath: string,
  method: "GET" | "POST" | "PUT",
  url: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const mod = await import(routePath);
  const handler = mod[method] as (req: NextRequest, extra: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const req = new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : { headers: { "Content-Type": "application/json" } }),
  });
  const res = await handler(req, { params: Promise.resolve(params ?? {}) });
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: parsed };
}

async function main() {
  const createdOrderIds: number[] = [];
  const createdOrderNumbers: string[] = [];
  const createdPhotoIds: number[] = [];
  const createdUserIds: number[] = [];
  const createdLedgerRefs: string[] = [];
  const createdPayoutRefs: string[] = [];
  const createdEventIds: Array<{ provider: "stripe" | "mvola" | "orange_money" | "airtel_money"; eventId: string }> = [];

  const countBaseline = async () => ({
    orders: (await db.select({ id: orders.id }).from(orders)).length,
    certificates: (await db.select({ id: certificates.id }).from(certificates)).length,
    orderItems: (await db.select({ id: orderItems.id }).from(orderItems)).length,
    walletTransactions: (await db.select({ id: walletTransactions.id }).from(walletTransactions)).length,
    webhookEvents: (await db.select({ id: webhookEvents.id }).from(webhookEvents)).length,
  });
  const baseline = await countBaseline();
  log(`AVANT — orders=${baseline.orders}, certs=${baseline.certificates}, oi=${baseline.orderItems}, wt=${baseline.walletTransactions}, wh=${baseline.webhookEvents}`);

  const cleanup = async () => {
    for (const ev of createdEventIds) {
      await db
        .delete(webhookEvents)
        .where(and(eq(webhookEvents.provider, ev.provider), eq(webhookEvents.eventId, ev.eventId)))
        .catch((e) => console.warn("[cleanup] webhook_events", e.message));
    }
    for (const id of createdOrderIds) {
      await db.delete(orders).where(eq(orders.id, id)).catch((e) => console.warn("[cleanup] orders", e.message));
    }
    for (const ref of createdLedgerRefs) {
      await db
        .delete(walletTransactions)
        .where(and(eq(walletTransactions.reference, ref), inArray(walletTransactions.status, ["pending", "completed", "failed"])))
        .catch((e) => console.warn("[cleanup] ledger", e.message));
    }
    for (const num of createdOrderNumbers) {
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.reference, `PRC-${num}`))
        .catch((e) => console.warn("[cleanup] PRC ledger", e.message));
    }
    for (const ref of createdPayoutRefs) {
      await db.delete(payouts).where(eq(payouts.reference, ref)).catch((e) => console.warn("[cleanup] payouts", e.message));
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.reference, ref))
        .catch((e) => console.warn("[cleanup] PAY ledger", e.message));
    }
    for (const id of createdPhotoIds) {
      await db.delete(photos).where(eq(photos.id, id)).catch((e) => console.warn("[cleanup] photos", e.message));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id)).catch((e) => console.warn("[cleanup] users", e.message));
    }
  };

  try {
    /* ---------- Données de base ---------- */
    const [photographer] = await db
      .insert(users)
      .values({
        name: `Verify WH Photog ${stamp}`,
        email: `verify-wh-photog-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "photographer",
      })
      .returning();
    createdUserIds.push(photographer.id);

    const [buyer] = await db
      .insert(users)
      .values({
        name: `Verify WH Buyer ${stamp}`,
        email: `verify-wh-buyer-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "buyer",
        availableBalance: "0.00",
      })
      .returning();
    createdUserIds.push(buyer.id);

    const shipping = { name: buyer.name, email: buyer.email, address: { city: "Antananarivo" } };

    /* Admin de test (session forgée R/S). */
    const [admin] = await db
      .insert(users)
      .values({
        name: `Verify WH Admin ${stamp}`,
        email: `verify-wh-admin-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "admin",
      })
      .returning();
    createdUserIds.push(admin.id);

    const newPhoto = async (over: Partial<typeof photos.$inferInsert> = {}) => {
      const [photo] = await db
        .insert(photos)
        .values({
          title: `Verify WH Photo ${stamp} ${randomPart()}`,
          slug: `verify-wh-photo-${stamp}-${randomPart()}`,
          imageUrl: "/images/isalo.jpg",
          orientation: "landscape",
          licenseType: "limited",
          photographerId: photographer.id,
          basePrice: "49.90",
          totalEditions: 10,
          availableStock: 5,
          isPublished: true,
          ...over,
        })
        .returning();
      createdPhotoIds.push(photo.id);
      return photo;
    };

    const newOrderOn = async (photoId: number, over: Partial<typeof orders.$inferInsert> = {}) => {
      const created = await createPendingOrder({
        userId: buyer.id,
        items: [{ photoId, sizeId: null, mountId: null, qty: 1 }],
        shipping,
        paymentMethod: "card",
        paymentProvider: "stripe",
        currency: "EUR",
      });
      createdOrderIds.push(created.order.id);
      createdOrderNumbers.push(created.order.orderNumber);
      if (over.expectedAmountMinor != null || over.expectedCurrency != null || over.kind != null) {
        await db
          .update(orders)
          .set({
            ...(over.expectedAmountMinor != null ? { expectedAmountMinor: over.expectedAmountMinor } : {}),
            ...(over.expectedCurrency != null ? { expectedCurrency: over.expectedCurrency } : {}),
            ...(over.kind != null ? { kind: over.kind } : {}),
          })
          .where(eq(orders.id, created.order.id));
      }
      const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, created.order.id)).limit(1);
      return { order: await orderByNumber(created.order.orderNumber), item };
    };

    /* ===== A. session.completed — montant différent ===== */
    log("A — session.completed : montant ≠ attendu → refund_pending SANS remboursement auto");
    {
      const { eventId } = await seededEventId("amount");
      createdEventIds.push({ provider: "stripe", eventId });
      const photo = await newPhoto();
      const { order: oA } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const r = await postStripe({
        eventId,
        type: "checkout.session.completed",
        object: makeSession({ id: `cs_a_${stamp}`, client_reference_id: oA!.orderNumber, amount_total: 9999, payment_intent: `pi_a_${stamp}` }),
      });
      check(r.status === 200, `A: 200 attendu (reçu ${r.status})`);
      const row = await orderByNumber(oA!.orderNumber);
      check(row!.status === "refund_pending", `A: refund_pending (${row!.status})`);
      check(row!.refundReason === "amount_mismatch", `A: raison amount_mismatch (${row!.refundReason})`);
      check(row!.paymentRef === `pi_a_${stamp}`, `A: paymentRef enregistré (${row!.paymentRef})`);
      check(row!.refundId == null, "A: AUCUN refund_id (pas de remboursement auto)");
      check(row!.refundedAt == null, "A: refunded_at NULL");
      check((await webhookStatus("stripe", eventId))?.status === "processed", "A: event processed");
      log(`  OK — refund_pending(amount_mismatch), paymentRef=pi_a_${stamp}, aucun refund (refundCalls=${refundCalls})`);
    }

    /* ===== B. session.completed — devise différente ===== */
    log("B — session.completed : devise ≠ attendue → refund_pending(currency_mismatch)");
    {
      const { eventId } = await seededEventId("currency");
      createdEventIds.push({ provider: "stripe", eventId });
      const photo = await newPhoto();
      const { order: oB } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const r = await postStripe({
        eventId,
        type: "checkout.session.completed",
        object: makeSession({ id: `cs_b_${stamp}`, client_reference_id: oB!.orderNumber, currency: "usd", amount_total: 460 },
        ),
      });
      check(r.status === 200, `B: 200 attendu (reçu ${r.status})`);
      const row = await orderByNumber(oB!.orderNumber);
      check(row!.status === "refund_pending", `B: refund_pending (${row!.status})`);
      check(row!.refundReason === "currency_mismatch", `B: raison currency_mismatch (${row!.refundReason})`);
      log("  OK — refund_pending(currency_mismatch)");
    }

    /* ===== C. session.completed — payment_status != paid (async) ===== */
    log("C — session.completed : payment_status=unpaid → 200, commande PENDING, paymentRef posé");
    {
      const { eventId } = await seededEventId("unpaid");
      createdEventIds.push({ provider: "stripe", eventId });
      const photo = await newPhoto();
      const { order: oC } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const r = await postStripe({
        eventId,
        type: "checkout.session.completed",
        object: makeSession({
          id: `cs_c_${stamp}`,
          client_reference_id: oC!.orderNumber,
          payment_status: "unpaid",
          payment_intent: `pi_c_${stamp}`,
          amount_total: 4990,
        }),
      });
      check(r.status === 200, `C: 200 attendu (reçu ${r.status})`);
      const row = await orderByNumber(oC!.orderNumber);
      check(row!.status === "pending", `C: reste pending (${row!.status})`);
      check(row!.paymentRef === `pi_c_${stamp}`, `C: paymentRef=payment_intent posé (${row!.paymentRef})`);
      check((await certsForOrder(row!.id)) === 0, "C: aucun certificat tant que non payé");
      log(`  OK — pending, paymentRef=pi_c_${stamp}, 0 cert`);
    }

    /* ===== D. async_payment_succeeded (après C) ===== */
    log("D — async_payment_succeeded : finalisation + re-validation du montant");
    {
      const { eventId } = await seededEventId("async");
      createdEventIds.push({ provider: "stripe", eventId });
      const rowC = await db
        .select()
        .from(orders)
        .where(eq(orders.paymentRef, `pi_c_${stamp}`))
        .limit(1);
      check(rowC.length === 1, "D: l'ordre C est retrouvé par paymentRef");
      const oD = rowC[0];
      const [oDItem] = await db.select().from(orderItems).where(eq(orderItems.orderId, oD.id)).limit(1);
      const [oDPhoto0] = await db.select({ s: photos.availableStock }).from(photos).where(eq(photos.id, oDItem.photoId));
      const stockD0 = oDPhoto0?.s as number;
      const r = await postStripe({
        eventId,
        type: "async_payment_succeeded",
        object: { id: `pi_c_${stamp}`, object: "payment_intent", amount: 4990, currency: "eur", status: "succeeded" },
      });
      check(r.status === 200, `D: 200 attendu (reçu ${r.status})`);
      const oDAfter = await orderByNumber(oD.orderNumber);
      check(oDAfter!.status === "paid", `D: statut paid (${oDAfter!.status})`);
      check((await certsForOrder(oDAfter!.id)) === 1, "D: 1 certificat émis");
      check((await countLedger(`PRC-${oD.orderNumber}`)) === 1, "D: 1 ligne ledger");
      const [oDPhoto1] = await db.select().from(photos).where(eq(photos.id, oDItem.photoId));
      check(oDPhoto1.availableStock === stockD0 - 1, `D: stock décrémenté de 1 (${oDPhoto1.availableStock})`);
      log(`  OK — paid, 1 cert, 1 ledger, stock=${oDPhoto1.availableStock}`);
    }

    /* ===== E. Dernière pièce : 2 événements concurrents, stock=1 ===== */
    log("E — stock=1, 2 sessions concurrentes : UNE paid, l'AUTRE refunded, UN SEUL appel de remboursement");
    {
      const e1 = await seededEventId("race1");
      const e2 = await seededEventId("race2");
      createdEventIds.push({ provider: "stripe", eventId: e1.eventId }, { provider: "stripe", eventId: e2.eventId });
      const photo = await newPhoto({ totalEditions: 3, availableStock: 1 });
      const stockE0 = 1;
      const { order: oE1 } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const { order: oE2 } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const refundsBefore = refundCalls;
      const [r1, r2] = await Promise.all([
        postStripe({
          eventId: e1.eventId,
          type: "checkout.session.completed",
          object: makeSession({ id: `cs_e1_${stamp}`, client_reference_id: oE1!.orderNumber, payment_intent: `pi_e1_${stamp}` }),
        }),
        postStripe({
          eventId: e2.eventId,
          type: "checkout.session.completed",
          object: makeSession({ id: `cs_e2_${stamp}`, client_reference_id: oE2!.orderNumber, payment_intent: `pi_e2_${stamp}` }),
        }),
      ]);
      check(r1.status === 200 && r2.status === 200, `E: deux réponses 200 (${r1.status}/${r2.status})`);
      const rowE1 = await orderByNumber(oE1!.orderNumber);
      const rowE2 = await orderByNumber(oE2!.orderNumber);
      const statuses = [rowE1!.status, rowE2!.status];
      const paid = statuses.filter((s) => s === "paid").length;
      const refunded = statuses.filter((s) => s === "refunded").length;
      check(paid === 1, `E: exactement UNE paid (${statuses.join(",")})`);
      check(refunded === 1, `E: exactement UNE refunded (${statuses.join(",")})`);
      const refundDelta = refundCalls - refundsBefore;
      check(refundDelta === 1, `E: UN SEUL appel de remboursement (Δ=${refundDelta})`);
      const [photoEAfter] = await db.select().from(photos).where(eq(photos.id, photo.id));
      check(photoEAfter.availableStock === stockE0 - 1, `E: stock décrémenté une seule fois (${photoEAfter.availableStock})`);
      const refundedRow = [rowE1, rowE2].find((r) => r!.status === "refunded")!;
      check(refundedRow!.refundReason === "stock_exhausted", `E: raison du refund = stock_exhausted (${refundedRow!.refundReason})`);
      check(Boolean(refundedRow!.refundId), "E: refund_id présent (remboursement réel via fake)");
      check((await certsForOrder(refundedRow!.id)) === 0, "E: AUCUN certificat pour la commande refunded");
      log(`  OK — paid=1, refunded=1 (raison stock_exhausted, refund_id=${refundedRow!.refundId}), Δrefund=1, stock=${photoEAfter.availableStock}`);
    }

    /* ===== F. API de remboursement en échec, puis replay ===== */
    log("F — API de remboursement KO : 500 + event 'received' ; replay -> 200 + refunded (2 tentatives max)");
    {
      const { eventId } = await seededEventId("refundfail");
      createdEventIds.push({ provider: "stripe", eventId });
      const photo = await newPhoto({ totalEditions: 3, availableStock: 1 });
      const { order: oF } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      await db.update(photos).set({ availableStock: 0 }).where(eq(photos.id, photo.id));
      refundFailures = 1;
      const refundsBefore = refundCalls;
      const r1 = await postStripe({
        eventId,
        type: "checkout.session.completed",
        object: makeSession({ id: `cs_f_${stamp}`, client_reference_id: oF!.orderNumber, payment_intent: `pi_f_${stamp}` }),
      });
      check(r1.status === 500, `F: 1er essai → 500 (reçu ${r1.status})`);
      const rowF1 = await orderByNumber(oF!.orderNumber);
      check(rowF1!.status === "refund_pending", `F: commande en refund_pending (${rowF1!.status})`);
      check(rowF1!.refundId == null, "F: aucun refund_id tant que l'API a échoué");
      const evF = await webhookStatus("stripe", eventId);
      check(evF!.status === "received", `F: event reste 'received' (${evF!.status})`);
      check(evF!.error != null, "F: error enregistrée pour diagnostic");
      check(refundCalls - refundsBefore === 1, "F: 1 tentative de remboursement (KO)");

      refundFailures = 0;
      const r2 = await postStripe({
        eventId,
        type: "checkout.session.completed",
        object: makeSession({ id: `cs_f_${stamp}`, client_reference_id: oF!.orderNumber, payment_intent: `pi_f_${stamp}` }),
      });
      check(r2.status === 200, `F: replay → 200 (reçu ${r2.status})`);
      const rowF2 = await orderByNumber(oF!.orderNumber);
      check(rowF2!.status === "refunded", `F: commande refunded après replay (${rowF2!.status})`);
      check(Boolean(rowF2!.refundId), "F: refund_id écrit");
      check(rowF2!.refundedAt != null, "F: refunded_at écrit");
      check(refundCalls - refundsBefore === 2, `F: une SEULE relance de remboursement (Δ=${refundCalls - refundsBefore})`);
      check((await webhookStatus("stripe", eventId))?.status === "processed", "F: event processed après replay");
      log(`  OK — 500 puis 200; refund_id=${rowF2!.refundId}, exactement 2 tentatives au total`);
    }

    /* ===== G. Replay d'un event déjà processé ===== */
    log("G — replay d'un event 'processed' → 200 no-op, aucun nouvel effet");
    {
      const { eventId } = await seededEventId("replay");
      createdEventIds.push({ provider: "stripe", eventId });
      const photo = await newPhoto();
      const { order: oG } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const session = makeSession({ id: `cs_g_${stamp}`, client_reference_id: oG!.orderNumber });
      await postStripe({ eventId, type: "checkout.session.completed", object: session });
      const before = { certs: await certsForOrder(oG!.id), refunds: refundCalls, ledger: await countLedger(`PRC-${oG!.orderNumber}`) };
      const r = await postStripe({ eventId, type: "checkout.session.completed", object: session });
      check(r.status === 200, `G: replay → 200 (reçu ${r.status})`);
      check((await certsForOrder(oG!.id)) === before.certs, "G: AUCUN nouveau certificat");
      check((await countLedger(`PRC-${oG!.orderNumber}`)) === before.ledger, "G: aucune nouvelle ligne ledger");
      check(refundCalls === before.refunds, "G: aucun nouvel appel de remboursement");
      log(`  OK — no-op complet (certs=${before.certs}, ledger=${before.ledger}, refunds=${before.refunds})`);
    }

    /* ===== H. Événement orphelin ===== */
    log("H — événement orphelin → 200 + unmatched + alerte");
    {
      const { eventId } = await seededEventId("orphan");
      createdEventIds.push({ provider: "stripe", eventId });
      const r = await postStripe({
        eventId,
        type: "checkout.session.completed",
        object: makeSession({ id: `cs_h_${stamp}`, client_reference_id: "APR-2099-000001" }),
      });
      check(r.status === 200, `H: 200 (reçu ${r.status})`);
      check((await webhookStatus("stripe", eventId))?.status === "unmatched", "H: event unmatched");
      log("  OK — unmatched, réponse 200");
    }

    /* ===== I. Signatures invalides ===== */
    log("I — signatures : manquante / invalide /            mauvaise clé → 400 avant tout effet");
    {
      const photo = await newPhoto();
      const { order: oI } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const rMissing = await postStripe({ eventId: `evt_i_missing_${stamp}`, type: "checkout.session.completed", object: makeSession({ client_reference_id: oI!.orderNumber }), headerString: "missing" });
      check(rMissing.status === 400, `I: sans signature → 400 (reçu ${rMissing.status})`);
      const rGarbage = await postStripe({ eventId: `evt_i_garbage_${stamp}`, type: "checkout.session.completed", object: makeSession({ client_reference_id: oI!.orderNumber }), headerString: "garbage" });
      check(rGarbage.status === 400, `I: signature invalide → 400 (reçu ${rGarbage.status})`);
      const rWrongSecret = await postStripe({ eventId: `evt_i_wrong_${stamp}`, type: "checkout.session.completed", object: makeSession({ client_reference_id: oI!.orderNumber }), headerString: "wrong-secret" });
      check(rWrongSecret.status === 400, `I: signature avec clé ≠ attendue → 400 (reçu ${rWrongSecret.status})`);
      const rowI = await orderByNumber(oI!.orderNumber);
      check(rowI!.status === "pending", `I: commande inchangée (pending) (${rowI!.status})`);
      check((await webhookStatus("stripe", `evt_i_missing_${stamp}`)) == null, "I: aucun event enregistré pour un 400");
      log("  OK — 400 avant tout effet, commande toujours pending");
    }

    /* ===== J. Admin /confirm : helper partagé (MÊME chemin que webhooks) ===== */
    log("J — admin/confirm (handleConfirmedPayment) : succès puis échec définitif → refunded");
    {
      /* Succès */
      const photoOk = await newPhoto();
      const { order: oJ0 } = await newOrderOn(photoOk.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const j0 = await handleConfirmedPayment(oJ0!.orderNumber, "pi_admin_ok");
      check(j0.status === "finalized", `J: succès → finalized (${j0.status})`);
      check((await orderByNumber(oJ0!.orderNumber))!.status === "paid", "J: statut paid");
      log(`  OK — finalized, statut paid`);

      /* Échec définitif : stock vidé entre la commande et la confirmation admin */
      const photoFail = await newPhoto({ totalEditions: 3, availableStock: 1 });
      const { order: oJ1 } = await newOrderOn(photoFail.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      await db.update(photos).set({ availableStock: 0 }).where(eq(photos.id, photoFail.id));
      const refundsBeforeJ = refundCalls;
      const j1 = await handleConfirmedPayment(oJ1!.orderNumber, "pi_admin_fail");
      check(j1.status === "refunded", `J: échec définitif → refunded (${j1.status})`);
      check(j1.reason === "stock_exhausted", `J: raison transmise (${j1.reason})`);
      check(Boolean(j1.refundId), "J: refund_id présent");
      check(refundCalls - refundsBeforeJ === 1, `J: 1 appel de remboursement (Δ=${refundCalls - refundsBeforeJ})`);
      const rowJ1 = await orderByNumber(oJ1!.orderNumber);
      check(rowJ1!.status === "refunded" && rowJ1!.refundReason === "stock_exhausted", `J: ordre refunded avec raison (${rowJ1!.status}/${rowJ1!.refundReason})`);
      log(`  OK — refunded(raison=${j1.reason}, refund_id=${j1.refundId}), Δrefund=1`);
    }

    /* ===== K. Mobile Money : MVola succès + rejeu ; Orange échec définitif ===== */
    log("K — Mobile Money : MVola succès + rejeu no-op ; Orange échec définitif SANS remboursement auto");
    {
      const photoK = await newPhoto();
      const { order: oK } = await newOrderOn(photoK.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const evtIdK = `mvola:${oK!.orderNumber}:completed`;
      createdEventIds.push({ provider: "mvola", eventId: evtIdK });
      const rK1 = await postMM({
        provider: "mvola",
        body: {
          transactionStatus: "completed",
          metadata: [{ key: "reference", value: oK!.orderNumber }],
          transactionReference: "mvola_ref_k",
          serverCorrelationId: "sc_k",
        },
        token: "token_mvola_test",
      });
      check(rK1.status === 200, `K: mvola succès → 200 (reçu ${rK1.status})`);
      check((await orderByNumber(oK!.orderNumber))!.status === "paid", "K: commande paid");
      check((await certsForOrder(oK!.id)) === 1, "K: 1 certificat");
      const rK2 = await postMM({
        provider: "mvola",
        body: {
          transactionStatus: "completed",
          metadata: [{ key: "reference", value: oK!.orderNumber }],
          transactionReference: "mvola_ref_k",
        },
        token: "token_mvola_test",
      });
      check(rK2.status === 200, `K: rejeu → 200 (reçu ${rK2.status})`);
      check((await certsForOrder(oK!.id)) === 1, "K: rejeu sans doublon de certificat");
      check((await webhookStatus("mvola", evtIdK))?.status === "processed", "K: event processed");
      log("  OK — MVola paid + rejeu no-op (1 cert)");

      /* Orange échec définitif (photo vidée) : refund_pending SANS appel Stripe */
      const photoOF = await newPhoto({ totalEditions: 3, availableStock: 1 });
      const { order: oO } = await newOrderOn(photoOF.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      await db.update(photos).set({ availableStock: 0 }).where(eq(photos.id, photoOF.id));
      const evtIdO = `orange-money:${oO!.orderNumber}:SUCCESS`;
      createdEventIds.push({ provider: "orange_money", eventId: evtIdO });
      const refundsBeforeO = refundCalls;
      const rO = await postMM({
        provider: "orange-money",
        body: { order_id: oO!.orderNumber, status: "SUCCESS", txnid: "om_ref_o" },
        token: "token_orange_test",
      });
      check(rO.status === 200, `K: orange succès → 200 (reçu ${rO.status})`);
      const rowO = await orderByNumber(oO!.orderNumber);
      check(rowO!.status === "refund_pending", `K: orange → refund_pending (${rowO!.status})`);
      check(rowO!.refundReason === "stock_exhausted", "K: raison stock_exhausted");
      check(rowO!.refundId == null, "K: AUCUN remboursement auto Mobile Money (refund_id NULL)");
      check(refundCalls - refundsBeforeO === 0, `K: Δrefund=0 (skipRefund) (Δ=${refundCalls - refundsBeforeO})`);
      check((await webhookStatus("orange_money", evtIdO))?.status === "processed", "K: event processed");
      log(`  OK — Orange refund_pending(raison=stock_exhausted), Δrefund=0, event processed`);

      /* MVola avec mauvaise clé → 401 (aucun effet) */
      const rWrong = await postMM({
        provider: "mvola",
        body: { transactionStatus: "completed", metadata: [{ key: "reference", value: oK!.orderNumber }] },
        header: "wrong",
      });
      check(rWrong.status === 401, `K: mauvaise clé MVola → 401 (reçu ${rWrong.status})`);
    }

    /* ===== L. Dépôt WLD : montant conforme → crédit ; montant différent → aucun crédit ===== */
    log("L — Dépôt WLD via Stripe : conforme crédite, différent N'EST PAS crédité");
    {
      const dep = await createWalletDepositTx({ userId: buyer.id, amount: 25, paymentMethod: "stripe" });
      createdLedgerRefs.push(dep.reference);
      const evtIdD = `evt_wld_ok_${stamp}`;
      createdEventIds.push({ provider: "stripe", eventId: evtIdD });
      const balance0 = parseFloat(
        (await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyer.id)).limit(1))[0].b ?? "0",
      );
      const r = await postStripe({
        eventId: evtIdD,
        type: "checkout.session.completed",
        object: makeSession({ id: `cs_wld_ok_${stamp}`, client_reference_id: dep.reference, amount_total: 2500, currency: "eur", payment_intent: `pi_wld_ok_${stamp}` }),
      });
      check(r.status === 200, `L: wld conforme → 200 (reçu ${r.status})`);
      const [depAfter] = await db.select().from(walletTransactions).where(eq(walletTransactions.reference, dep.reference));
      check(depAfter.status === "completed", `L: dépôt completed (${depAfter.status})`);
      const balance1 = parseFloat(
        (await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyer.id)).limit(1))[0].b ?? "0",
      );
      check(Math.abs(balance1 - (balance0 + 25)) < 0.001, `L: solde crédité de 25 (${((balance1 - balance0)).toFixed(2)})`);
      log("  OK — WLD conforme: dépôt completed, solde +25.00");

      const depBad = await createWalletDepositTx({ userId: buyer.id, amount: 25, paymentMethod: "stripe" });
      createdLedgerRefs.push(depBad.reference);
      const evtIdBad = `evt_wld_bad_${stamp}`;
      createdEventIds.push({ provider: "stripe", eventId: evtIdBad });
      const balance2 = balance1;
      const rBad = await postStripe({
        eventId: evtIdBad,
        type: "checkout.session.completed",
        object: makeSession({ id: `cs_wld_bad_${stamp}`, client_reference_id: depBad.reference, amount_total: 2501, currency: "eur", payment_intent: `pi_wld_bad_${stamp}` }),
      });
      check(rBad.status === 200, `L: wld montant ≠ → 200 (reçu ${rBad.status})`);
      const [depBadAfter] = await db.select().from(walletTransactions).where(eq(walletTransactions.reference, depBad.reference));
      check(depBadAfter.status === "pending", `L: dépôt montant ≠ RESTE pending (${depBadAfter.status})`);
      const balance3 = parseFloat(
        (await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyer.id)).limit(1))[0].b ?? "0",
      );
      check(Math.abs(balance3 - balance2) < 0.001, "L: AUCUN crédit pour un montant différent");
      log("  OK — WLD montant ≠ : dépôt reste pending, aucun crédit");
    }

    /* ===== ÉTAPE 2 ===== */

    /* ===== M. charge.refunded COMPLET d'une commande finalisée ===== */
    log("M — charge.refunded COMPLET : clawback + cert révoqué + stock inchangé + replay safe");
    {
      const { eventId } = await seededEventId("refundfinal");
      createdEventIds.push({ provider: "stripe", eventId });
      const photoM = await newPhoto();
      const { order: oM } = await newOrderOn(photoM.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const fm = await handleConfirmedPayment(oM!.orderNumber, "pi_m_main");
      check(fm.status === "finalized", `M: commande finalisée (${fm.status})`);
      const rowM0 = await orderByNumber(oM!.orderNumber);
      check(rowM0!.status === "paid", `M: paid (${rowM0!.status})`);
      check((await certsForOrder(rowM0!.id)) === 1, "M: 1 certificat émis");
      const balM0 = await balance(photographer.id);
      const rM = await postStripe({
        eventId,
        type: "charge.refunded",
        object: { id: `ch_m_${stamp}`, object: "charge", amount: 4990, amount_refunded: 4990, currency: "eur", payment_intent: "pi_m_main", refunded: true },
      });
      check(rM.status === 200, `M: 200 (reçu ${rM.status})`);
      const rowM1 = await orderByNumber(oM!.orderNumber);
      check(rowM1!.status === "refunded", `M: statut refunded (${rowM1!.status})`);
      check(rowM1!.refundReason === "order_refunded", `M: raison order_refunded (${rowM1!.refundReason})`);
      check(rowM1!.refundedAt != null, "M: refunded_at écrit");
      check((await revokedCertsForOrder(rowM1!.id)) === 1, "M: certificat révoqué (revoked_at)");
      check((await countLedger(`RFD-${oM!.orderNumber}`)) === 1, "M: UNE ligne ledger RFD");
      const balM1 = await balance(photographer.id);
      check(Math.abs(balM1 - (balM0 - 39.92)) < 0.011, `M: clawback 39.92 (${balM0.toFixed(2)} → ${balM1.toFixed(2)})`);
      const [photoM1] = await db.select().from(photos).where(eq(photos.id, photoM.id));
      check(photoM1.availableStock === 4, `M: stock INCHANGÉ, pas de restitution (${photoM1.availableStock})`);
      check((await webhookStatus("stripe", eventId))?.status === "processed", "M: event processed");
      log(`  OK — refunded, cert révoqué, RFD=1, clawback 39.92 (${balM0.toFixed(2)}→${balM1.toFixed(2)}), stock inchangé`);

      const rM2 = await postStripe({
        eventId,
        type: "charge.refunded",
        object: { id: `ch_m_${stamp}`, object: "charge", amount: 4990, amount_refunded: 4990, currency: "eur", payment_intent: "pi_m_main", refunded: true },
      });
      check(rM2.status === 200, "M: replay → 200");
      check((await countLedger(`RFD-${oM!.orderNumber}`)) === 1, "M: replay : toujours UNE ligne RFD");
      check((await revokedCertsForOrder(rowM1!.id)) === 1, "M: replay : cert toujours révoqué, pas de double révocation");
      check(Math.abs((await balance(photographer.id)) - balM1) < 0.001, "M: replay : aucun débit supplémentaire");
      log("  OK — replay : aucun double effet");
    }

    /* ===== N. charge.refunded sur refund_pending (jamais créditée) ===== */
    log("N — charge.refunded sur refund_pending : finalisée SANS clawback");
    {
      const mismatchEvent = `evt_n_mismatch_${stamp}`;
      const { eventId } = await seededEventId("refundpending");
      createdEventIds.push({ provider: "stripe", eventId: mismatchEvent }, { provider: "stripe", eventId });
      const photoN = await newPhoto();
      const { order: oN } = await newOrderOn(photoN.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const r0 = await postStripe({
        eventId: mismatchEvent,
        type: "checkout.session.completed",
        object: makeSession({ id: `cs_n_${stamp}`, client_reference_id: oN!.orderNumber, amount_total: 9999, payment_intent: `pi_n_${stamp}` }),
      });
      check(r0.status === 200, `N: mismatch → 200 (reçu ${r0.status})`);
      const balN0 = await balance(photographer.id);
      const r = await postStripe({
        eventId,
        type: "charge.refunded",
        object: { id: `ch_n_${stamp}`, object: "charge", amount: 4990, amount_refunded: 4990, currency: "eur", payment_intent: `pi_n_${stamp}`, refunded: true },
      });
      check(r.status === 200, `N: 200 (reçu ${r.status})`);
      const rowN = await orderByNumber(oN!.orderNumber);
      check(rowN!.status === "refunded", `N: statut refunded (${rowN!.status})`);
      check(rowN!.refundReason === "amount_mismatch", `N: raison conservée amount_mismatch (${rowN!.refundReason})`);
      check(rowN!.refundedAt != null, "N: refunded_at écrit");
      check((await countLedger(`RFD-${oN!.orderNumber}`)) === 0, "N: AUCUNE ligne RFD (jamais créditée)");
      check((await certsForOrder(rowN!.id)) === 0, "N: aucun certificat");
      check(Math.abs((await balance(photographer.id)) - balN0) < 0.001, "N: solde vendeur inchangé");
      log("  OK — refund_pending → refunded, aucune reprise, aucun certificat");
    }

    /* ===== O. Litiges : created / won / lost ===== */
    log("O — Litiges : created → drapeau SANS clawback ; won → levé ; lost → clawback sans appel refund");
    {
      /* O1 — litige ouvert puis GAGNÉ */
      const photoO1 = await newPhoto();
      const { order: oO1 } = await newOrderOn(photoO1.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const f1 = await handleConfirmedPayment(oO1!.orderNumber, "pi_o1");
      check(f1.status === "finalized", `O: O1 finalisée (${f1.status})`);
      const evtO1a = `${stamp}_dp_create_o1`;
      const evtO1b = `${stamp}_dp_close_o1`;
      createdEventIds.push({ provider: "stripe", eventId: evtO1a }, { provider: "stripe", eventId: evtO1b });
      const rC = await postStripe({
        eventId: evtO1a,
        type: "charge.dispute.created",
        object: { id: `dp_o1_${stamp}`, object: "dispute", amount: 4990, currency: "eur", reason: "fraudulent", status: "under_review", charge: `ch_o1_${stamp}`, payment_intent: "pi_o1" },
      });
      check(rC.status === 200, `O: dispute.created → 200 (reçu ${rC.status})`);
      const rowO1a = await orderByNumber(oO1!.orderNumber);
      check(rowO1a!.status === "paid", "O: la vente reste paid pendant le litige");
      check(rowO1a!.disputedAt != null, "O: disputed_at posé");
      check((await countLedger(`RFD-${oO1!.orderNumber}`)) === 0, "O: aucun clawback au litige ouvert");
      const refundsC = refundCalls;
      const rW = await postStripe({
        eventId: evtO1b,
        type: "charge.dispute.closed",
        object: { id: `dp_o1_${stamp}`, object: "dispute", amount: 4990, currency: "eur", status: "won", charge: `ch_o1_${stamp}`, payment_intent: "pi_o1" },
      });
      check(rW.status === 200, `O: dispute.closed won → 200 (reçu ${rW.status})`);
      const rowO1b = await orderByNumber(oO1!.orderNumber);
      check(rowO1b!.status === "paid", "O: GAGNÉ → la vente reste paid");
      check(rowO1b!.disputedAt == null, "O: drapeau litige levé (disputed_at NULL)");
      check(refundCalls === refundsC, "O: aucun appel de remboursement (fonds conservés)");
      check((await countLedger(`RFD-${oO1!.orderNumber}`)) === 0, "O: aucun clawback");
      log("  OK — created: drapeau + vente conservée; won: drapeau levé, Δrefund=0, pas de clawback");

      /* O2 — litige PERDU */
      const photoO2 = await newPhoto();
      const { order: oO2 } = await newOrderOn(photoO2.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const f2 = await handleConfirmedPayment(oO2!.orderNumber, "pi_o2");
      check(f2.status === "finalized", `O: O2 finalisée (${f2.status})`);
      const evtO2a = `${stamp}_dp_create_o2`;
      const evtO2b = `${stamp}_dp_close_o2`;
      createdEventIds.push({ provider: "stripe", eventId: evtO2a }, { provider: "stripe", eventId: evtO2b });
      await postStripe({
        eventId: evtO2a,
        type: "charge.dispute.created",
        object: { id: `dp_o2_${stamp}`, object: "dispute", amount: 4990, currency: "eur", reason: "fraudulent", status: "under_review", charge: `ch_o2_${stamp}`, payment_intent: "pi_o2" },
      });
      const refundsL = refundCalls;
      const rL = await postStripe({
        eventId: evtO2b,
        type: "charge.dispute.closed",
        object: { id: `dp_o2_${stamp}`, object: "dispute", amount: 4990, currency: "eur", status: "lost", charge: `ch_o2_${stamp}`, payment_intent: "pi_o2" },
      });
      check(rL.status === 200, `O: dispute.closed lost → 200 (reçu ${rL.status})`);
      const rowO2 = await orderByNumber(oO2!.orderNumber);
      check(rowO2!.status === "refunded", `O: PERDU → refunded (${rowO2!.status})`);
      check((await countLedger(`RFD-${oO2!.orderNumber}`)) === 1, "O: UNE ligne RFD (clawback)");
      check((await revokedCertsForOrder(rowO2!.id)) === 1, "O: certificat révoqué");
      const [photoO2A] = await db.select().from(photos).where(eq(photos.id, photoO2.id));
      check(photoO2A.availableStock === 4, `O: stock inchangé (${photoO2A.availableStock})`);
      check(refundCalls === refundsL, "O: AUCUN appel refundStripeCharge (Stripe a déjà débité)");
      log("  OK — PERDU: refunded + RFD=1 + cert révoqué, stock inchangé, Δrefund=0");
    }

    /* ===== P. Solde négatif vendeur + achat wallet insuffisant (402) ===== */
    log("P — clawback AU-DELÀ du solde (négatif accepté) + achat wallet insuffisant refusé (402)");
    {
      await db.update(users).set({ availableBalance: "15.00" }).where(eq(users.id, photographer.id));
      const photoP = await newPhoto();
      const { order: oPr } = await newOrderOn(photoP.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const fp = await handleConfirmedPayment(oPr!.orderNumber, "pi_p");
      check(fp.status === "finalized", `P: finalisée (${fp.status})`);
      check(Math.abs((await balance(photographer.id)) - (15 + 39.92)) < 0.011, "P: crédit 39.92 au-dessus du solde initial");
      await db.update(users).set({ availableBalance: "15.00" }).where(eq(users.id, photographer.id)); /* retrait simulé */
      const evtP = `evt_p_refund_${stamp}`;
      createdEventIds.push({ provider: "stripe", eventId: evtP });
      const rPr = await postStripe({
        eventId: evtP,
        type: "charge.refunded",
        object: { id: `ch_p_${stamp}`, object: "charge", amount: 4990, amount_refunded: 4990, currency: "eur", payment_intent: "pi_p", refunded: true },
      });
      check(rPr.status === 200, `P: 200 (reçu ${rPr.status})`);
      const balNeg = await balance(photographer.id);
      check(balNeg < 0, `P: solde NÉGATIF accepté (${balNeg.toFixed(2)})`);
      check(Math.abs(balNeg - (15 - 39.92)) < 0.011, `P: -24.92 attendu (${balNeg.toFixed(2)})`);
      check((await countLedger(`RFD-${oPr!.orderNumber}`)) === 1, "P: RFD enregistrée");
      log(`  OK — clawback au-delà du solde : ${balNeg.toFixed(2)} EUR (dette vendeur assumée)`);

      await db.update(users).set({ availableBalance: "10.00" }).where(eq(users.id, buyer.id));
      const photoPW = await newPhoto();
      const pw = await createPendingOrder({
        userId: buyer.id,
        items: [{ photoId: photoPW.id, sizeId: null, mountId: null, qty: 1 }],
        shipping,
        paymentMethod: "card",
        paymentProvider: "stripe",
        currency: "EUR",
      });
      createdOrderIds.push(pw.order.id);
      createdOrderNumbers.push(pw.order.orderNumber);
      const balB = await balance(buyer.id);
      let status402 = -1;
      try {
        await payOrderWithWallet(pw.order, buyer.id);
      } catch (e) {
        status402 = (e as OrderError).status ?? -1;
      }
      check(status402 === 402, `P: payOrderWithWallet → 402 (reçu ${status402})`);
      const rowPW = await orderByNumber(pw.order.orderNumber);
      check(rowPW!.status === "pending", `P: ordre reste pending (${rowPW!.status})`);
      check(Math.abs((await balance(buyer.id)) - balB) < 0.001, "P: solde acheteur inchangé");
      check((await countLedger(`PRC-${pw.order.orderNumber}`)) === 0, "P: aucune ligne ledger");
      log("  OK — 402, ordre pending, aucun débit");
    }

    /* ===== Q. charge.refunded PARTIEL : statut CONSERVÉ ===== */
    log("Q — charge.refunded PARTIEL : statut CONSERVÉ + alerte, aucun clawback");
    {
      const photoQ = await newPhoto();
      const { order: oQ } = await newOrderOn(photoQ.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const fq = await handleConfirmedPayment(oQ!.orderNumber, "pi_q");
      check(fq.status === "finalized", `Q: finalisée (${fq.status})`);
      const balQ = await balance(photographer.id);
      const evtQ = `evt_q_partial_${stamp}`;
      createdEventIds.push({ provider: "stripe", eventId: evtQ });
      const rQ = await postStripe({
        eventId: evtQ,
        type: "charge.refunded",
        object: { id: `ch_q_${stamp}`, object: "charge", amount: 4990, amount_refunded: 2000, currency: "eur", payment_intent: "pi_q", refunded: false },
      });
      check(rQ.status === 200, `Q: 200 (reçu ${rQ.status})`);
      const rowQ = await orderByNumber(oQ!.orderNumber);
      check(rowQ!.status === "paid", `Q: statut CONSERVÉ paid (${rowQ!.status})`);
      check((await countLedger(`RFD-${oQ!.orderNumber}`)) === 0, "Q: aucun clawback");
      check(Math.abs((await balance(photographer.id)) - balQ) < 0.001, "Q: solde vendeur inchangé");
      check((await revokedCertsForOrder(rowQ!.id)) === 0, "Q: certificat NON révoqué");
      log("  OK — paid conservé, aucune reprise, aucune révocation");
    }

    /* ===== R. PUT /api/admin/orders/[orderNumber] : verrouillage des transitions ===== */
    log("R — PUT admin : transitions monétaires refusées, couples déclarés acceptés, 400/401");
    {
      const mkOrder = async (start: OrderStatus) => {
        const photo = await newPhoto();
        const { order } = await newOrderOn(photo.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
        const [row] = await db
          .update(orders)
          .set({ status: start })
          .where(eq(orders.orderNumber, order!.orderNumber))
          .returning({ orderNumber: orders.orderNumber, status: orders.status });
        return row!.orderNumber;
      };

      const routeAdminPut = "../app/api/admin/orders/[orderNumber]/route";

      /* Sans session → 401 */
      clearSession();
      const oNoAuth = await mkOrder("pending");
      const rNoAuth = await callRoute(routeAdminPut, "PUT", `http://localhost/api/admin/orders/${oNoAuth}`, { status: "cancelled" }, { orderNumber: oNoAuth });
      check(rNoAuth.status === 401, `R: sans session → 401 (reçu ${rNoAuth.status})`);

      await forgeSession(admin);
      const blocked: Array<{ from: OrderStatus; to: string }> = [
        { from: "pending", to: "paid" },
        { from: "paid", to: "cancelled" },
        { from: "refund_pending", to: "cancelled" },
        { from: "refunded", to: "pending" },
      ];
      for (const t of blocked) {
        const num = await mkOrder(t.from);
        const r = await callRoute(routeAdminPut, "PUT", `http://localhost/api/admin/orders/${num}`, { status: t.to }, { orderNumber: num });
        check(r.status === 422 && r.body.code === "BLOCKED_MONEY_TRANSITION", `R: ${t.from}→${t.to} → 422 BLOCKED_MONEY_TRANSITION (reçu ${r.status}/${String(r.body.code)})`);
      }
      log("  OK — 4 transitions touchant paid|refund_pending|refunded → 422 BLOCKED_MONEY_TRANSITION");

      const oInvalid = await mkOrder("pending");
      const rInv = await callRoute(routeAdminPut, "PUT", `http://localhost/api/admin/orders/${oInvalid}`, { status: "shipped" }, { orderNumber: oInvalid });
      check(rInv.status === 422 && rInv.body.code === "INVALID_TRANSITION", `R: pending→shipped → 422 INVALID_TRANSITION (reçu ${rInv.status}/${String(rInv.body.code)})`);
      log("  OK — pending→shipped hors tableau → 422 INVALID_TRANSITION");

      const allowed: Array<[OrderStatus, OrderStatus]> = [
        ["pending", "cancelled"],
        ["cancelled", "pending"],
        ["shipped", "delivered"],
        ["delivered", "completed"],
        ["delivered", "shipped"],
        ["completed", "delivered"],
      ];
      for (const [from, to] of allowed) {
        const num = await mkOrder(from);
        const r = await callRoute(routeAdminPut, "PUT", `http://localhost/api/admin/orders/${num}`, { status: to }, { orderNumber: num });
        check(r.status === 200 && r.body.status === to, `R: ${from}→${to} → 200 ${to} (reçu ${r.status}/${String(r.body.status)})`);
      }
      log("  OK — 6 transitions déclarées acceptées (statut confirmé dans la réponse)");

      const oBad = await mkOrder("pending");
      const rBad = await callRoute(routeAdminPut, "PUT", `http://localhost/api/admin/orders/${oBad}`, { status: "paypal" }, { orderNumber: oBad });
      check(rBad.status === 400, `R: statut inconnu → 400 (reçu ${rBad.status})`);

      await forgeSession({ id: buyer.id, name: buyer.name, email: buyer.email, role: "buyer" });
      const oNb = await mkOrder("pending");
      const rNb = await callRoute(routeAdminPut, "PUT", `http://localhost/api/admin/orders/${oNb}`, { status: "cancelled" }, { orderNumber: oNb });
      check(rNb.status === 401, `R: non-admin → 401 (reçu ${rNb.status})`);
      clearSession();
      log("  OK — 400 statut inconnu ; 401 non-admin");
    }

    /* ===== S. POST /api/payouts : réservation, échec opérateur (stub), remboursement ===== */
    log("S — POST /api/payouts (session forgée) : réservation → échec opérateur → refund ; GET ; insuffisant ; retry admin");
    {
      const [payoutUser] = await db
        .insert(users)
        .values({
          name: `Verify WH Payout ${stamp}`,
          email: `verify-wh-payout-${stamp}@aperio.test`,
          passwordHash: PASSWORD_HASH,
          role: "photographer",
          availableBalance: "100.00",
        })
        .returning();
      createdUserIds.push(payoutUser.id);
      await forgeSession(payoutUser);

      const routePayouts = "../app/api/payouts/route";
      const body1 = { amount: 50, method: "stripe", account: "acct_10001", accountName: "Photographe Test" };
      const r1 = await callRoute(routePayouts, "POST", "http://localhost/api/payouts", body1);
      check(r1.status === 422 && r1.body.ok === false, `S: échec opérateur (stub) → 422 ok=false (reçu ${r1.status}/${String(r1.body.ok)})`);
      /* Le disbursement est UNE tentative d'égress réseau LÉGITIME du flux (API
         opérateur) : le stub l'a faite échouer — c'est le clean-fallback testé. */
      const payoutEgress: string | null = networkViolation;
      networkViolation = null;
      check((payoutEgress ?? "").includes("https.request"), "S: tentative ÉGRESS payout interceptée par le stub (unique)");
      const ref1 = (r1.body.payout as { reference?: string } | undefined)?.reference ?? "";
      check(typeof ref1 === "string" && ref1.startsWith("PAY-"), `S: reference PAY- (${ref1})`);
      createdPayoutRefs.push(ref1);
      check(Math.abs((await balance(payoutUser.id)) - 100) < 0.001, "S: solde REMBOURSÉ après échec (100.00)");
      const [ledger1] = await db.select().from(walletTransactions).where(eq(walletTransactions.reference, ref1));
      check(ledger1?.status === "failed", `S: ledger sync failed (${ledger1?.status})`);
      const [pRow1] = await db.select().from(payouts).where(eq(payouts.reference, ref1));
      check(pRow1?.status === "failed", `S: payout failed (${pRow1?.status})`);
      log(`  OK — ${ref1}: réservé → failed (stub réseau), solde remboursé, ledger failed`);

      const g1 = await callRoute(routePayouts, "GET", "http://localhost/api/payouts");
      check(g1.status === 200, `S: GET /api/payouts → 200 (reçu ${g1.status})`);
      const list = ((g1.body.payouts as { rows?: Array<{ reference: string; amount: unknown; status: string }> } | undefined)?.rows) ?? [];
      check(list.length === 1 && list[0].reference === ref1, `S: liste OK (${list.length})`);
      check(typeof list[0]?.amount === "string", `S: amount::text renvoyé en string (${typeof list[0]?.amount})`);
      log(`  OK — GET : ${list.length} payout, amount="${String(list[0]?.amount)}" (::text)`);

      /* Solde insuffisant → 400 */
      await db.update(users).set({ availableBalance: "5.00" }).where(eq(users.id, payoutUser.id));
      const rIns = await callRoute(routePayouts, "POST", "http://localhost/api/payouts", body1);
      check(rIns.status === 400, `S: solde insuffisant → 400 (reçu ${rIns.status})`);
      check(String(rIns.body.error).includes("insuffisant"), `S: message insuffisant (${String(rIns.body.error)})`);
      log("  OK — solde insuffisant → 400, aucune réservation");

      /* Retry admin sur le payout échoué. */
      await forgeSession({ id: admin.id, name: admin.name, email: admin.email, role: "admin" });
      const rRetryNb = await callRoute("../app/api/admin/payouts/[reference]/retry/route", "POST", `http://localhost/api/admin/payouts/${ref1}/retry`, undefined, { reference: ref1 });
      check(rRetryNb.status === 400 && String(rRetryNb.body.error).includes("insuffisant"), `S: retry solde insuffisant (5 €) → 400 (reçu ${rRetryNb.status}/${String(rRetryNb.body.error)})`);
      log("  OK — retry : solde insuffisant → 400, aucun disbursement");
      /* Solde ensuite restauré (le test « insuffisant » précédent a laissé 5 €). */
      await db.update(users).set({ availableBalance: "100.00" }).where(eq(users.id, payoutUser.id));
      const rRetry = await callRoute("../app/api/admin/payouts/[reference]/retry/route", "POST", `http://localhost/api/admin/payouts/${ref1}/retry`, undefined, { reference: ref1 });
      check(rRetry.status === 422 && rRetry.body.ok === false, `S: retry → 422 (stub) (reçu ${rRetry.status}/${String(rRetry.body.ok)})`);
      const retryEgress: string | null = networkViolation;
      networkViolation = null;
      check((retryEgress ?? "").includes("https.request"), "S: retry : tentative ÉGRESS interceptée (unique)");
      check(Math.abs((await balance(payoutUser.id)) - 100) < 0.001, "S: retry : solde REMBOURSÉ (100.00)");
      const [pRow1b] = await db.select().from(payouts).where(eq(payouts.reference, ref1));
      check(pRow1b?.status === "failed", `S: retry : payout toujours failed (${pRow1b?.status})`);
      await forgeSession(payoutUser);
      const rRetryNbAdmin = await callRoute("../app/api/admin/payouts/[reference]/retry/route", "POST", `http://localhost/api/admin/payouts/${ref1}/retry`, undefined, { reference: ref1 });
      check(rRetryNbAdmin.status === 403, `S: retry non-admin → 403 (reçu ${rRetryNbAdmin.status})`);
      clearSession();
      log("  OK — retry admin : re-réservation puis refund, payout reste failed");
    }

    /* ===== ÉTAPE 3 ===== */

    /* ===== T. Solde vendeur NÉGATIF (-24.92 €) : lectures OK, aucun retrait ===== */
    log("T — solde vendeur NÉGATIF -24.92 € : lectures 200, payout 400, wallet 402, vente nette 15.00");
    {
      await db.update(users).set({ availableBalance: "-24.92" }).where(eq(users.id, photographer.id));

      await forgeSession({ id: photographer.id, name: photographer.name, email: photographer.email, role: "photographer" });

      const rPoutNeg = await callRoute("../app/api/payouts/route", "POST", "http://localhost/api/payouts", {
        amount: 10,
        method: "stripe",
        account: "acct_neg",
        accountName: "Photographe Test",
      });
      check(rPoutNeg.status === 400 && String(rPoutNeg.body.error).includes("insuffisant"), `T: payout 10.00 @ -24.92 → 400 (${rPoutNeg.status}/${String(rPoutNeg.body.error)})`);
      const poutPhotogCount = (await db.select({ id: payouts.id }).from(payouts).where(eq(payouts.userId, photographer.id))).length;
      check(poutPhotogCount === 0, `T: aucune ligne payout créée (${poutPhotogCount})`);
      check(Math.abs((await balance(photographer.id)) + 24.92) < 0.001, "T: solde TOUJOURS -24.92 (aucune réservation)");
      log("  OK — payout refusé à solde négatif : 400, aucun payout, aucune réservation");

      const photoT = await newPhoto();
      const { order: oNeg } = await createPendingOrder({
        userId: photographer.id,
        items: [{ photoId: photoT.id, sizeId: null, mountId: null, qty: 1 }],
        shipping,
        paymentMethod: "card",
        paymentProvider: "stripe",
        currency: "EUR",
      });
      createdOrderIds.push(oNeg.id);
      createdOrderNumbers.push(oNeg.orderNumber);
      try {
        await payOrderWithWallet({ orderNumber: oNeg.orderNumber, total: oNeg.total }, photographer.id);
        check(false, "T: wallet checkout sur solde négatif aurait dû échouer");
      } catch (e) {
        check(e instanceof OrderError && (e as OrderError).status === 402, `T: wallet → OrderError 402 (${(e as OrderError).status})`);
      }
      check(Math.abs((await balance(photographer.id)) + 24.92) < 0.001, "T: wallet échoué → solde inchangé (-24.92)");
      const [oNeg2] = await db.select().from(orders).where(eq(orders.orderNumber, oNeg.orderNumber)).limit(1);
      check(oNeg2?.status === "pending", `T: commande TOUJOURS pending (${oNeg2?.status})`);
      log("  OK — wallet : OrderError 402, solde intact, commande toujours pending");

      const rDash = await callRoute("../app/api/dashboard/route", "GET", "http://localhost/api/dashboard");
      check(rDash.status === 200, `T: GET /api/dashboard → 200 (reçu ${rDash.status})`);
      const statsT = rDash.body.stats as { availableBalance?: unknown; availableBalanceLabel?: unknown } | undefined;
      check(typeof statsT?.availableBalance === "number", `T: stats.availableBalance numérique (${typeof statsT?.availableBalance})`);
      check(Math.abs(Number(statsT?.availableBalance) + 24.92) < 0.001, `T: stats.availableBalance = -24.92 (${Number(statsT?.availableBalance).toFixed(2)})`);
      const labelT = String(statsT?.availableBalanceLabel ?? "");
      check(labelT.includes("-24,92"), `T: label négatif formaté (${labelT})`);
      log(`  OK — dashboard : availableBalance=${Number(statsT?.availableBalance).toFixed(2)}, label="${labelT}"`);

      const rMeT = await callRoute("../app/api/me/route", "GET", "http://localhost/api/me");
      check(rMeT.status === 200, `T: GET /api/me → 200 (reçu ${rMeT.status})`);
      log(`  OK — /api/me → 200 (user=${String((rMeT.body.user as { email?: unknown } | undefined)?.email ?? "")})`);

      clearSession();

      const photoT2 = await newPhoto();
      const { order: oT2 } = await newOrderOn(photoT2.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const fT = await handleConfirmedPayment(oT2!.orderNumber, `pi_neg_${stamp}`);
      check(fT.status === "finalized", `T: vente finalisée (${fT.status})`);
      const netT = await balance(photographer.id);
      check(Math.abs(netT - 15.0) < 0.011, `T: solde net -24.92 + 39.92 = 15.00 (${netT.toFixed(2)})`);
      log("  OK — nouvelle vente créditée : -24.92 + 39.92 = 15.00");
    }

    /* ===== U. Commande DIGITALE : licence + download réel, refund → révocation ===== */
    log("U — commande DIGITALE : entitlement + download 200 ; charge.refunded → download 403, clawback UNIQUE");
    {
      await db.update(users).set({ availableBalance: "100.00" }).where(eq(users.id, photographer.id));
      const hdName = `i6-dig-${stamp}.bin`;
      const hdAbs = join(process.cwd(), "storage", "hd", hdName);
      await mkdir(join(process.cwd(), "storage", "hd"), { recursive: true });
      await writeFile(hdAbs, "APERIO-I6-DIGITAL-E2E-TEST");
      const photoU = await newPhoto({ hdPath: hdName, hdMime: "application/octet-stream" });

      const dig = await createDigitalOrder({
        userId: buyer.id,
        photoId: photoU.id,
        licenseType: "personal",
        paymentProvider: "stripe",
      });
      createdOrderIds.push(dig.order.id);
      createdOrderNumbers.push(dig.order.orderNumber);
      const fu = await handleConfirmedPayment(dig.order.orderNumber, "pi_dig_u");
      check(fu.status === "finalized", `U: digital finalisée (${fu.status})`);
      const rowU0 = await orderByNumber(dig.order.orderNumber);
      check(rowU0!.status === "completed", `U: statut completed (${rowU0!.status})`);
      const entBefore = await db.select({ id: entitlements.id }).from(entitlements).where(and(eq(entitlements.userId, buyer.id), eq(entitlements.photoId, photoU.id)));
      check(entBefore.length === 1, "U: 1 entitlement créé");
      const balU0 = await balance(photographer.id);
      check(Math.abs(balU0 - 139.92) < 0.011, `U: crédit 39.92 (${balU0.toFixed(2)})`);

      await forgeSession({ id: buyer.id, name: buyer.name, email: buyer.email, role: "buyer" });
      const dl0 = await callRoute("../app/api/artworks/[id]/download/route", "GET", `http://localhost/api/artworks/${photoU.id}/download`, undefined, { id: String(photoU.id) });
      check(dl0.status === 200, `U: download entitlé → 200 (reçu ${dl0.status})`);
      log("  OK — digital finalized, entitlement actif, download 200 (fichier HD réel)");

      const evtU = `evt_u_digital_${stamp}`;
      createdEventIds.push({ provider: "stripe", eventId: evtU });
      const rU = await postStripe({
        eventId: evtU,
        type: "charge.refunded",
        object: { id: `ch_u_${stamp}`, object: "charge", amount: 4990, amount_refunded: 4990, currency: "eur", payment_intent: "pi_dig_u", refunded: true },
      });
      check(rU.status === 200, `U: charge.refunded → 200 (reçu ${rU.status})`);
      const rowU1 = await orderByNumber(dig.order.orderNumber);
      check(rowU1!.status === "refunded", `U: commande refunded (${rowU1!.status})`);
      const entAfter = await db.select({ id: entitlements.id }).from(entitlements).where(and(eq(entitlements.userId, buyer.id), eq(entitlements.photoId, photoU.id)));
      check(entAfter.length === 0, "U: entitlement SUPPRIMÉ (licence révoquée)");
      check((await countLedger(`RFD-${dig.order.orderNumber}`)) === 1, "U: UNE ligne RFD");
      const balU1 = await balance(photographer.id);
      check(Math.abs(balU1 - 100.0) < 0.011, `U: clawback 39.92 → 100.00 (${balU1.toFixed(2)})`);

      const dl1 = await callRoute("../app/api/artworks/[id]/download/route", "GET", `http://localhost/api/artworks/${photoU.id}/download`, undefined, { id: String(photoU.id) });
      check(dl1.status === 403, `U: download APRÈS refund → 403 (reçu ${dl1.status})`);
      log("  OK — refund digital : entitlement supprimé, download 403 (licence révoquée)");

      await postStripe({
        eventId: evtU,
        type: "charge.refunded",
        object: { id: `ch_u_${stamp}`, object: "charge", amount: 4990, amount_refunded: 4990, currency: "eur", payment_intent: "pi_dig_u", refunded: true },
      });
      check((await countLedger(`RFD-${dig.order.orderNumber}`)) === 1, "U: rejeu : toujours UNE ligne RFD");
      check(Math.abs((await balance(photographer.id)) - 100.0) < 0.001, "U: rejeu : aucun re-clawback");
      clearSession();
      await unlink(hdAbs).catch(() => undefined);
      log("  OK — rejeu du refund : aucun double effet (UNE RFD, solde stable)");
    }

    /* ===== V. charge.refunded cumulé : partiel conservé, total → refunded ===== */
    log("V — charge.refunded CUMULÉ : partiel → paid CONSERVÉ ; total → refunded avec clawback unique");
    {
      await db.update(users).set({ availableBalance: "0.00" }).where(eq(users.id, photographer.id));
      const photoV = await newPhoto();
      const { order: oV } = await newOrderOn(photoV.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const fv = await handleConfirmedPayment(oV!.orderNumber, "pi_v");
      check(fv.status === "finalized", `V: finalisée (${fv.status})`);
      check(Math.abs((await balance(photographer.id)) - 39.92) < 0.011, "V: solde 39.92 après vente");

      const evtV1 = `evt_v_partial_${stamp}`;
      const evtV2 = `evt_v_total_${stamp}`;
      createdEventIds.push({ provider: "stripe", eventId: evtV1 }, { provider: "stripe", eventId: evtV2 });
      const rV1 = await postStripe({
        eventId: evtV1,
        type: "charge.refunded",
        object: { id: `ch_v_${stamp}`, object: "charge", amount: 4990, amount_refunded: 2000, currency: "eur", payment_intent: "pi_v", refunded: false },
      });
      check(rV1.status === 200, `V: partiel → 200 (reçu ${rV1.status})`);
      const rowV1 = await orderByNumber(oV!.orderNumber);
      check(rowV1!.status === "paid", `V: partiel → statut CONSERVÉ paid (${rowV1!.status})`);
      check((await countLedger(`RFD-${oV!.orderNumber}`)) === 0, "V: aucun clawback partiel");
      check(Math.abs((await balance(photographer.id)) - 39.92) < 0.001, "V: solde vendeur inchangé au partiel");
      log("  OK — partiel (2000/4990) : paid conservé, aucun clawback, vente intacte");

      const rV2 = await postStripe({
        eventId: evtV2,
        type: "charge.refunded",
        object: { id: `ch_v_${stamp}`, object: "charge", amount: 4990, amount_refunded: 4990, currency: "eur", payment_intent: "pi_v", refunded: true },
      });
      check(rV2.status === 200, `V: cumul total → 200 (reçu ${rV2.status})`);
      const rowV2 = await orderByNumber(oV!.orderNumber);
      check(rowV2!.status === "refunded", `V: cumul → refunded (${rowV2!.status})`);
      check((await countLedger(`RFD-${oV!.orderNumber}`)) === 1, "V: clawback UNE seule ligne");
      check(Math.abs((await balance(photographer.id))) < 0.001, "V: clawback 39.92 → 0.00");
      log("  OK — cumul total (4990/4990) : refunded, clawback UNIQUE de 39.92");

      await postStripe({
        eventId: evtV2,
        type: "charge.refunded",
        object: { id: `ch_v_${stamp}`, object: "charge", amount: 4990, amount_refunded: 4990, currency: "eur", payment_intent: "pi_v", refunded: true },
      });
      check((await countLedger(`RFD-${oV!.orderNumber}`)) === 1, "V: rejeu : toujours UNE RFD");
      check(Math.abs((await balance(photographer.id))) < 0.001, "V: rejeu : aucun re-clawback");
      log("  OK — rejeu du cumul total : aucun double effet");
    }

    /* ===== W. Retry-refund admin : 401/403, jamais double, 422/409 bornes ===== */
    log("W — POST /api/admin/orders/[orderNumber]/retry-refund : 401/403, refund unique, 422 inéligible, 409 sans ref");
    {
      const routeRetryW = "../app/api/admin/orders/[orderNumber]/retry-refund/route";
      const mkRefundPending = async (reason: RefundReason, paymentRef?: string): Promise<string> => {
        const photoW = await newPhoto();
        const { order: oW } = await newOrderOn(photoW.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
        const flipped = await markOrderRefundPending(oW!.orderNumber, reason, paymentRef);
        check(flipped != null, `W: ${oW!.orderNumber} → refund_pending`);
        return oW!.orderNumber;
      };

      clearSession();
      const o401 = await mkRefundPending("stock_exhausted", "pi_w_401");
      const r401 = await callRoute(routeRetryW, "POST", `http://localhost/api/admin/orders/${o401}/retry-refund`, {}, { orderNumber: o401 });
      check(r401.status === 401, `W: sans session → 401 (reçu ${r401.status})`);

      await forgeSession({ id: buyer.id, name: buyer.name, email: buyer.email, role: "buyer" });
      const o403 = await mkRefundPending("photo_unavailable", "pi_w_403");
      const r403 = await callRoute(routeRetryW, "POST", `http://localhost/api/admin/orders/${o403}/retry-refund`, {}, { orderNumber: o403 });
      check(r403.status === 403, `W: non-admin → 403 (reçu ${r403.status})`);
      clearSession();

      await forgeSession(admin);
      const oOk = await mkRefundPending("stock_exhausted", "pi_w_ok");
      const refundsW0 = refundCalls;
      const rOk = await callRoute(routeRetryW, "POST", `http://localhost/api/admin/orders/${oOk}/retry-refund`, {}, { orderNumber: oOk });
      check(rOk.status === 200, `W: retry admin → 200 (reçu ${rOk.status})`);
      const rowOk = await orderByNumber(oOk);
      check(rowOk!.status === "refunded", `W: statut refunded (${rowOk!.status})`);
      check(Boolean(rowOk!.refundId), "W: refund_id écrit");
      check(refundCalls - refundsW0 === 1, `W: UN appel de remboursement (Δ=${refundCalls - refundsW0})`);

      const rOk2 = await callRoute(routeRetryW, "POST", `http://localhost/api/admin/orders/${oOk}/retry-refund`, {}, { orderNumber: oOk });
      check(rOk2.status === 200 && rOk2.body.status === "already-refunded", `W: déjà remboursée → 200 already-refunded (${rOk2.status}/${String(rOk2.body.status)})`);
      check(refundCalls - refundsW0 === 1, "W: JAMAIS de second appel (idempotency refund-<orderNumber>)");
      log("  OK — retry éligible : refunded via fake (Δrefund=1), double → already-refunded (Δ=0)");

      const oBad = await mkRefundPending("amount_mismatch", "pi_w_bad");
      const rBad = await callRoute(routeRetryW, "POST", `http://localhost/api/admin/orders/${oBad}/retry-refund`, {}, { orderNumber: oBad });
      check(rBad.status === 422 && rBad.body.code === "REFUND_REASON_NOT_ELIGIBLE", `W: amount_mismatch → 422 (${rBad.status}/${String(rBad.body.code)})`);
      check(refundCalls - refundsW0 === 1, "W: aucun appel pour raison inéligible");
      log("  OK — amount_mismatch → 422 REFUND_REASON_NOT_ELIGIBLE (remboursement opérateur manuel)");

      const oNoRef = await mkRefundPending("finalization_failed");
      const rNoRef = await callRoute(routeRetryW, "POST", `http://localhost/api/admin/orders/${oNoRef}/retry-refund`, {}, { orderNumber: oNoRef });
      check(rNoRef.status === 409 && rNoRef.body.code === "MISSING_PAYMENT_REF", `W: sans paymentRef → 409 (${rNoRef.status}/${String(rNoRef.body.code)})`);
      check(refundCalls - refundsW0 === 1, "W: aucun appel sans paymentRef");
      clearSession();
      log("  OK — sans paymentRef (refund_pending d'un paiement opérateur) → 409 MISSING_PAYMENT_REF");
    }

    /* ===== X. Étape 3 Mobile Money : échec, succès tardif, échec après paiement, WLD ===== */
    log("X — ÉTAPE 3 Mobile Money : échec → cancelled, succès tardif → refund_pending, JAMAIS d'annulation après paiement");
    {
      /* X1 — Orange : échec (FAILED) → cancelled (replay no-op) ; succès tardif → refund_pending. */
      const photoX1 = await newPhoto();
      const { order: oX1 } = await newOrderOn(photoX1.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const evtX1f = `orange-money:${oX1!.orderNumber}:FAILED`;
      createdEventIds.push({ provider: "orange_money", eventId: evtX1f });
      const balX1 = await balance(photographer.id);
      const rX1 = await postMM({ provider: "orange-money", body: { order_id: oX1!.orderNumber, status: "FAILED", txnid: "om_x1" }, token: "token_orange_test" });
      check(rX1.status === 200 && rX1.body.action === "cancelled", `X: orange FAILED → 200 cancelled (${rX1.status}/${String(rX1.body.action)})`);
      const rowX1 = await orderByNumber(oX1!.orderNumber);
      check(rowX1!.status === "cancelled", `X: commande annulée (${rowX1!.status})`);
      check(Math.abs((await balance(photographer.id)) - balX1) < 0.001, "X: AUCUN crédit");
      check((await certsForOrder(rowX1!.id)) === 0, "X: 0 certificat");
      check((await webhookStatus("orange_money", evtX1f))?.status === "processed", "X: event échec processed");

      const rX1b = await postMM({ provider: "orange-money", body: { order_id: oX1!.orderNumber, status: "FAILED", txnid: "om_x1" }, token: "token_orange_test" });
      check(rX1b.status === 200, `X: replay FAILED → 200 no-op (${rX1b.status})`);
      check((await orderByNumber(oX1!.orderNumber))!.status === "cancelled", "X: reste cancelled (no-op)");

      const evtX1s = `orange-money:${oX1!.orderNumber}:SUCCESS`;
      createdEventIds.push({ provider: "orange_money", eventId: evtX1s });
      const refundsX1 = refundCalls;
      const rX1s = await postMM({ provider: "orange-money", body: { order_id: oX1!.orderNumber, status: "SUCCESS", txnid: "om_x1b" }, token: "token_orange_test" });
      check(rX1s.status === 200 && rX1s.body.action === "refund-pending-late-success", `X: succès tardif → 200 refund-pending (${rX1s.status}/${String(rX1s.body.action)})`);
      const rowX1s = await orderByNumber(oX1!.orderNumber);
      check(rowX1s!.status === "refund_pending", `X: succès tardif → refund_pending (${rowX1s!.status})`);
      check(rowX1s!.refundReason === "order_cancelled_after_payment", `X: raison order_cancelled_after_payment (${rowX1s!.refundReason})`);
      check(refundCalls === refundsX1, "X: AUCUN appel Stripe (skipRefund, remboursement opérateur MANUEL)");
      log("  OK — Orange : FAILED → cancelled (replay no-op), SUCCESS tardif → refund_pending, Δrefund=0");

      /* X2 — Orange : échec APRÈS paiement → vente JAMAIS annulée. */
      const photoX2 = await newPhoto();
      const { order: oX2 } = await newOrderOn(photoX2.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const fX2 = await handleConfirmedPayment(oX2!.orderNumber, "pi_x2");
      check(fX2.status === "finalized", `X: X2 finalisée (${fX2.status})`);
      const balX2 = await balance(photographer.id);
      const evtX2f = `orange-money:${oX2!.orderNumber}:FAILED`;
      createdEventIds.push({ provider: "orange_money", eventId: evtX2f });
      const rX2 = await postMM({ provider: "orange-money", body: { order_id: oX2!.orderNumber, status: "FAILED", txnid: "om_x2" }, token: "token_orange_test" });
      check(rX2.status === 200 && rX2.body.action === "already-handled-failure", `X: échec après paiement → 200 loggé (${rX2.status}/${String(rX2.body.action)})`);
      const rowX2 = await orderByNumber(oX2!.orderNumber);
      check(rowX2!.status === "paid", `X: vente CONSERVÉE paid (${rowX2!.status})`);
      check(Math.abs((await balance(photographer.id)) - balX2) < 0.001, "X: aucun crédit/débit supplémentaire");
      log("  OK — Orange : échec après paiement → audit, 200, vente jamais annulée");

      /* X3 — MVola : échec failed → cancelled ; succès tardif completed → refund_pending. */
      const photoX3 = await newPhoto();
      const { order: oX3 } = await newOrderOn(photoX3.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const evtX3f = `mvola:${oX3!.orderNumber}:failed`;
      createdEventIds.push({ provider: "mvola", eventId: evtX3f });
      const rX3 = await postMM({ provider: "mvola", body: { transactionStatus: "failed", metadata: [{ key: "reference", value: oX3!.orderNumber }], transactionReference: "mv_x3" }, token: "token_mvola_test" });
      check(rX3.status === 200 && rX3.body.action === "cancelled", `X: mv failed → 200 cancelled (${rX3.status}/${String(rX3.body.action)})`);
      check((await orderByNumber(oX3!.orderNumber))!.status === "cancelled", "X: mv commande annulée");
      const evtX3s = `mvola:${oX3!.orderNumber}:completed`;
      createdEventIds.push({ provider: "mvola", eventId: evtX3s });
      const rX3s = await postMM({ provider: "mvola", body: { transactionStatus: "completed", metadata: [{ key: "reference", value: oX3!.orderNumber }], transactionReference: "mv_x3b" }, token: "token_mvola_test" });
      check(rX3s.status === 200 && rX3s.body.action === "refund-pending-late-success", `X: mv succès tardif → refund_pending (${rX3s.status}/${String(rX3s.body.action)})`);
      const rowX3s = await orderByNumber(oX3!.orderNumber);
      check(rowX3s!.status === "refund_pending" && rowX3s!.refundReason === "order_cancelled_after_payment", `X: mv ${rowX3s!.status}/${rowX3s!.refundReason}`);
      log("  OK — MVola : failed → cancelled, completed tardif → refund_pending(order_cancelled_after_payment)");

      /* X4 — MVola : statut transitoire (pending) → aucun effet. */
      const photoX4 = await newPhoto();
      const { order: oX4 } = await newOrderOn(photoX4.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const evtX4p = `mvola:${oX4!.orderNumber}:pending`;
      createdEventIds.push({ provider: "mvola", eventId: evtX4p });
      const rX4 = await postMM({ provider: "mvola", body: { transactionStatus: "pending", metadata: [{ key: "reference", value: oX4!.orderNumber }], transactionReference: "mv_x4" }, token: "token_mvola_test" });
      check(rX4.status === 200, `X: pending → 200 (${rX4.status})`);
      check((await orderByNumber(oX4!.orderNumber))!.status === "pending", "X: pending → commande toujours pending, aucun effet");
      log("  OK — MVola : statut transitoire pending → 200, aucun effet");

      /* X5 — Airtel : échec (TF) → cancelled ; succès tardif (TS) → refund_pending. */
      const photoX5 = await newPhoto();
      const { order: oX5 } = await newOrderOn(photoX5.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const evtX5f = `airtel-money:${oX5!.orderNumber}:TF`;
      createdEventIds.push({ provider: "airtel_money", eventId: evtX5f });
      const rX5 = await postMM({ provider: "airtel-money", body: { transaction: { id: oX5!.orderNumber, status: "TF", airtel_money_id: "am_x5" } }, header: "bearer", token: "token_airtel_test" });
      check(rX5.status === 200 && rX5.body.action === "cancelled", `X: airtel TF → 200 cancelled (${rX5.status}/${String(rX5.body.action)})`);
      check((await orderByNumber(oX5!.orderNumber))!.status === "cancelled", "X: airtel commande annulée");
      const evtX5s = `airtel-money:${oX5!.orderNumber}:TS`;
      createdEventIds.push({ provider: "airtel_money", eventId: evtX5s });
      const rX5s = await postMM({ provider: "airtel-money", body: { transaction: { id: oX5!.orderNumber, status: "TS", airtel_money_id: "am_x5b" } }, header: "bearer", token: "token_airtel_test" });
      check(rX5s.status === 200 && rX5s.body.action === "refund-pending-late-success", `X: airtel TS tardif → refund_pending (${rX5s.status}/${String(rX5s.body.action)})`);
      check((await orderByNumber(oX5!.orderNumber))!.status === "refund_pending", "X: airtel refund_pending");
      log("  OK — Airtel : TF → cancelled, TS tardif → refund_pending(order_cancelled_after_payment)");

      /* X6 — Échec opérateur sur DÉPÔT wallet (WLD) : marqué failed, aucun crédit. */
      const depX = await createWalletDepositTx({ userId: buyer.id, amount: 20, paymentMethod: "mvola" });
      createdLedgerRefs.push(depX.reference);
      const balX6 = await balance(buyer.id);
      const evtX6 = `mvola:${depX.reference}:failed`;
      createdEventIds.push({ provider: "mvola", eventId: evtX6 });
      const rX6 = await postMM({ provider: "mvola", body: { transactionStatus: "failed", metadata: [{ key: "reference", value: depX.reference }], transactionReference: "mv_x6" }, token: "token_mvola_test" });
      check(rX6.status === 200 && rX6.body.action === "deposit-failed", `X: WLD failed → 200 deposit-failed (${rX6.status}/${String(rX6.body.action)})`);
      const [depXa] = await db.select().from(walletTransactions).where(eq(walletTransactions.reference, depX.reference));
      check(depXa?.status === "failed", `X: dépôt marqué failed (${depXa?.status})`);
      check(Math.abs((await balance(buyer.id)) - balX6) < 0.001, "X: AUCUN crédit WLD");
      log("  OK — Échec opérateur sur dépôt WLD : failed, aucun crédit, event processed");
    }

    /* ===== Y. mark-refunded admin : 401/403, 409 (statut/Stripe), succès MM, rejeu, 0 clawback/cert ===== */
    log("Y — POST /api/admin/orders/[orderNumber]/mark-refunded : 401/403, 400 corps, 409 (statut/Stripe), succès Mobile Money, rejeu, solde/certificats intacts");
    {
      const routeY = "../app/api/admin/orders/[orderNumber]/mark-refunded/route";
      const mmOrder = async (provider: "orange-money" | "mvola" | "airtel-money") => {
        const photoY = await newPhoto();
        const createdY = await createPendingOrder({
          userId: buyer.id,
          items: [{ photoId: photoY.id, sizeId: null, mountId: null, qty: 1 }],
          shipping,
          paymentMethod: provider,
          paymentProvider: provider,
          currency: "EUR",
        });
        createdOrderIds.push(createdY.order.id);
        createdOrderNumbers.push(createdY.order.orderNumber);
        return createdY.order.orderNumber;
      };
      const mmRefundPending = async (provider: "orange-money" | "mvola" | "airtel-money") => {
        const n = await mmOrder(provider);
        const flipped = await markOrderRefundPending(n, "stock_exhausted", `${provider}:op-ref-${randomPart()}`);
        check(flipped != null, `Y: ${n} → refund_pending`);
        return n;
      };

      clearSession();
      const oY401 = await mmRefundPending("mvola");
      const rY401 = await callRoute(routeY, "POST", `http://localhost/api/admin/orders/${oY401}/mark-refunded`, { operatorReference: "OP-REF-401" }, { orderNumber: oY401 });
      check(rY401.status === 401, `Y: sans session → 401 (reçu ${rY401.status})`);

      await forgeSession({ id: buyer.id, name: buyer.name, email: buyer.email, role: "buyer" });
      const oY403 = await mmRefundPending("orange-money");
      const rY403 = await callRoute(routeY, "POST", `http://localhost/api/admin/orders/${oY403}/mark-refunded`, { operatorReference: "OP-REF-403" }, { orderNumber: oY403 });
      check(rY403.status === 403, `Y: non-admin → 403 (reçu ${rY403.status})`);
      clearSession();

      await forgeSession(admin);

      /* 400 — corps invalide (operatorReference trop court) sur commande éligible. */
      const oY400 = await mmRefundPending("airtel-money");
      const rY400 = await callRoute(routeY, "POST", `http://localhost/api/admin/orders/${oY400}/mark-refunded`, { operatorReference: "ab" }, { orderNumber: oY400 });
      check(rY400.status === 400, `Y: operatorReference < 3 → 400 (reçu ${rY400.status})`);
      check((await orderByNumber(oY400))!.status === "refund_pending", "Y: 400 → aucun effet sur le statut");

      /* 409 NOT_REFUND_PENDING — commande Mobile Money encore `pending`. */
      const oYPend = await mmOrder("mvola");
      const rYPend = await callRoute(routeY, "POST", `http://localhost/api/admin/orders/${oYPend}/mark-refunded`, { operatorReference: "OP-REF-PEND" }, { orderNumber: oYPend });
      check(rYPend.status === 409 && rYPend.body.code === "NOT_REFUND_PENDING", `Y: pending → 409 NOT_REFUND_PENDING (${rYPend.status}/${String(rYPend.body.code)})`);

      /* 409 STRIPE_PAYMENT — paiement Stripe : jamais marqué remboursé manuellement. */
      const photoYStripe = await newPhoto();
      const { order: oYStripe } = await newOrderOn(photoYStripe.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const flippedStripe = await markOrderRefundPending(oYStripe!.orderNumber, "stock_exhausted", "pi_y_stripe");
      check(flippedStripe != null, "Y: commande Stripe → refund_pending");
      const rYStripe = await callRoute(routeY, "POST", `http://localhost/api/admin/orders/${oYStripe!.orderNumber}/mark-refunded`, { operatorReference: "OP-REF-STRIPE" }, { orderNumber: oYStripe!.orderNumber });
      check(rYStripe.status === 409 && rYStripe.body.code === "STRIPE_PAYMENT", `Y: Stripe → 409 STRIPE_PAYMENT (${rYStripe.status}/${String(rYStripe.body.code)})`);
      check((await orderByNumber(oYStripe!.orderNumber))!.status === "refund_pending", "Y: Stripe 409 → toujours refund_pending (rien émis)");

      /* Succès — remboursement opérateur MANUEL confirmé sur commande Mobile Money. */
      const oYOk = await mmRefundPending("orange-money");
      const balY = await balance(photographer.id);
      const rYOk = await callRoute(routeY, "POST", `http://localhost/api/admin/orders/${oYOk}/mark-refunded`, { operatorReference: "OM-OP-REF-2026-01", note: "restitution opérateur confirmée par téléphone" }, { orderNumber: oYOk });
      check(rYOk.status === 200 && rYOk.body.status === "refunded", `Y: succès → 200 refunded (${rYOk.status}/${String(rYOk.body.status)})`);
      const rowYOk = await orderByNumber(oYOk);
      check(rowYOk!.status === "refunded", `Y: statut refunded (${rowYOk!.status})`);
      check(rowYOk!.refundId === "manual:OM-OP-REF-2026-01", `Y: refund_id manual:… (${rowYOk!.refundId})`);
      check(rowYOk!.refundedAt != null, "Y: refunded_at écrit");
      check(Math.abs((await balance(photographer.id)) - balY) < 0.001, "Y: solde photographe INCHANGÉ (aucun clawback)");
      check((await certsForOrder(rowYOk!.id)) === 0, "Y: 0 certificat créé");
      check((await countLedger(`RFD-${oYOk}`)) === 0, "Y: aucune ligne ledger RFD (jamais crédité)");
      log("  OK — succès : refunded(manual:<ref>), refunded_at, solde/certificats/ledger intacts");

      /* Rejeu — idempotent, aucun second effet. */
      const rYOk2 = await callRoute(routeY, "POST", `http://localhost/api/admin/orders/${oYOk}/mark-refunded`, { operatorReference: "OM-OP-REF-2026-02" }, { orderNumber: oYOk });
      check(rYOk2.status === 200 && rYOk2.body.status === "already-refunded", `Y: rejeu → 200 already-refunded (${rYOk2.status}/${String(rYOk2.body.status)})`);
      const rowYOk2 = await orderByNumber(oYOk);
      check(rowYOk2!.refundId === "manual:OM-OP-REF-2026-01", "Y: rejeu → refund_id inchangé (jamais réécrit)");
      check(Math.abs((await balance(photographer.id)) - balY) < 0.001, "Y: rejeu → solde toujours inchangé");
      check((await countLedger(`RFD-${oYOk}`)) === 0, "Y: rejeu → toujours aucune ligne ledger");
      log("  OK — rejeu : already-refunded, refund_id intact, aucun double effet");
      clearSession();
    }

    /* ===== Z. Dashboard admin : compteurs + filtres liste (I6 clôture — tâche 2) ===== */
    log("Z — GET /api/admin : compteurs refund_pending/litiges/soldes négatifs ; GET /api/admin/orders : filtres");
    {
      const routeAdminZ = "../app/api/admin/route";
      const routeOrdersZ = "../app/api/admin/orders/route";
      const getOverview = async () => (await callRoute(routeAdminZ, "GET", "http://localhost/api/admin")).body as Record<string, any>;

      await forgeSession(admin);
      const before = await getOverview();
      const beforeRP = Number(before.stats?.refundPending ?? 0);

      /* UNE refund_pending de plus (raison amount_mismatch), UNE vente payée litigée,
         UN vendeur à solde négatif — puis re-lire /api/admin. */
      const photoZ = await newPhoto();
      const createdZ = await createPendingOrder({
        userId: buyer.id,
        items: [{ photoId: photoZ.id, sizeId: null, mountId: null, qty: 1 }],
        shipping,
        paymentMethod: "card",
        paymentProvider: "stripe",
        currency: "EUR",
      });
      createdOrderIds.push(createdZ.order.id);
      const flippedZ = await markOrderRefundPending(createdZ.order.orderNumber, "amount_mismatch", "pi_z_1");
      check(flippedZ != null, "Z: commande → refund_pending(amount_mismatch)");

      const photoZ2 = await newPhoto();
      const { order: oZ2 } = await newOrderOn(photoZ2.id, { expectedAmountMinor: 4990, expectedCurrency: "EUR" });
      const fz2 = await handleConfirmedPayment(oZ2!.orderNumber, "pi_z_2");
      check(fz2.status === "finalized", `Z: vente finalisée (${fz2.status})`);
      await db.update(orders).set({ disputedAt: new Date() }).where(eq(orders.orderNumber, oZ2!.orderNumber));

      await db.update(users).set({ availableBalance: "-7.50" }).where(eq(users.id, photographer.id));

      const after = await getOverview();
      check(Number(after.stats?.refundPending) === beforeRP + 1, `Z: compteur refund_pending ${beforeRP} → ${String(after.stats?.refundPending)}`);
      check(Number(after.stats?.refundPendingReasons?.amount_mismatch ?? 0) >= 1, "Z: ventilation par raison inclut amount_mismatch");
      check(after.stats?.oldestRefundPending != null, "Z: plus ancienne refund_pending retournée");
      check(Number(after.stats?.openDisputes) >= 1, `Z: litiges ouverts ≥ 1 (${String(after.stats?.openDisputes)})`);
      check(Number(after.stats?.negativeBalances) >= 1, `Z: soldes négatifs ≥ 1 (${String(after.stats?.negativeBalances)})`);
      check((after.stats?.negativePhotographers ?? []).some((p: { email: string }) => p.email === photographer.email), "Z: photographe à solde négatif listé");
      log("  OK — compteurs : refund_pending+1, ventilé par raison, plus ancienne, litiges, soldes négatifs");

      /* Filtres de la liste admin. */
      const listRP = (await callRoute(routeOrdersZ, "GET", "http://localhost/api/admin/orders?status=refund_pending&limit=100")).body as {
        orders: Array<{ orderNumber: string; status: string; refundReason: string }>;
      };
      check(listRP.orders.length >= 1 && listRP.orders.every((o) => o.status === "refund_pending"), "Z: filtre status=refund_pending accepté (uniquement refund_pending)");
      check(listRP.orders.some((o) => o.orderNumber === createdZ.order.orderNumber), "Z: la nouvelle refund_pending est listée (raison incluse)");

      const listRefunded = (await callRoute(routeOrdersZ, "GET", "http://localhost/api/admin/orders?status=refunded&limit=100")).body as {
        orders: Array<{ status: string }>;
        pagination: { total: number };
      };
      check(listRefunded.pagination?.total >= 1 && listRefunded.orders.every((o) => o.status === "refunded"), "Z: filtre status=refunded accepté (uniquement refunded)");

      const listDisp = (await callRoute(routeOrdersZ, "GET", "http://localhost/api/admin/orders?dispute=open")).body as {
        orders: Array<{ orderNumber: string; disputedAt: string | null; status: string }>;
        pagination: { total: number };
      };
      check(listDisp.orders.length >= 1 && listDisp.orders.every((o) => o.disputedAt != null && o.status === "paid"), `Z: filtre dispute=open → litigés non refundés (${listDisp.orders.length})`);
      check(listDisp.orders.some((o) => o.orderNumber === oZ2!.orderNumber), "Z: la commande litigée est listée");
      log("  OK — filtres liste : refund_pending, refunded, dispute=open (champs refund/dispute inclus)");
      clearSession();
    }

    /* ===== AA. Callbacks Mobile Money : champ retrouvant la commande + cas "unmatched" (I6 clôture — tâche 3) ===== */
    log("AA — Orange/MVola/Airtel : SUCCESS sur référence inconnue → 200 unmatched + alerte + event unmatched ; cartographie du champ réf");
    {
      const unknown = `NOPE-${randomPart()}-${stamp}`;

      /* Orange Money : la commande est retrouvée par `order_id` (status SUCCESS → success). */
      const evtOrange = `orange-money:${unknown}:SUCCESS`;
      createdEventIds.push({ provider: "orange_money", eventId: evtOrange });
      const rO = await postMM({ provider: "orange-money", body: { order_id: unknown, status: "SUCCESS", txnid: "om_unmatched_1" }, token: "token_orange_test" });
      check(rO.status === 200 && rO.body.action === "unmatched", `AA: orange inconnue → 200 unmatched (${rO.status}/${String(rO.body.action)})`);
      check((await webhookStatus("orange_money", evtOrange))?.status === "unmatched", "AA: event orange marqué unmatched");
      check((await orderByNumber(unknown)) === null, "AA: aucune commande créée (orange)");

      /* MVola : la commande est retrouvée par metadata[].key='reference' (transactionStatus=completed → success). */
      const evtMvola = `mvola:${unknown}:completed`;
      createdEventIds.push({ provider: "mvola", eventId: evtMvola });
      const rM = await postMM({ provider: "mvola", body: { transactionStatus: "completed", metadata: [{ key: "reference", value: unknown }], transactionReference: "mv_unmatched_1" }, token: "token_mvola_test" });
      check(rM.status === 200 && rM.body.action === "unmatched", `AA: mvola inconnue → 200 unmatched (${rM.status}/${String(rM.body.action)})`);
      check((await webhookStatus("mvola", evtMvola))?.status === "unmatched", "AA: event mvola marqué unmatched");
      check((await orderByNumber(unknown)) === null, "AA: aucune commande créée (mvola)");

      /* Airtel Money : la commande est retrouvée par transaction.id (status TS → success). */
      const evtAirtel = `airtel-money:${unknown}:TS`;
      createdEventIds.push({ provider: "airtel_money", eventId: evtAirtel });
      const rA = await postMM({ provider: "airtel-money", body: { transaction: { id: unknown, status: "TS", airtel_money_id: "am_unmatched_1" } }, header: "bearer", token: "token_airtel_test" });
      check(rA.status === 200 && rA.body.action === "unmatched", `AA: airtel inconnue → 200 unmatched (${rA.status}/${String(rA.body.action)})`);
      check((await webhookStatus("airtel_money", evtAirtel))?.status === "unmatched", "AA: event airtel marqué unmatched");
      check((await orderByNumber(unknown)) === null, "AA: aucune commande créée (airtel)");
      log("  OK — 3 opérateurs : référence absente → 200 unmatched, event unmatched, aucune commande ; mapping order_id / metadata.reference / transaction.id");

      /* Contre-preuve : le MÊME champ retrouve bien une commande existante (fire-and-forget
         déjà vérifié en blocs K/X) — ici la référence appartient à une vraie commande Mobile. */
      const photoAA = await newPhoto();
      const createdAA = await createPendingOrder({
        userId: buyer.id,
        items: [{ photoId: photoAA.id, sizeId: null, mountId: null, qty: 1 }],
        shipping,
        paymentMethod: "mvola",
        paymentProvider: "mvola",
        currency: "EUR",
      });
      createdOrderIds.push(createdAA.order.id);
      const evtAA2 = `mvola:${createdAA.order.orderNumber}:completed`;
      createdEventIds.push({ provider: "mvola", eventId: evtAA2 });
      const rAA2 = await postMM({ provider: "mvola", body: { transactionStatus: "completed", metadata: [{ key: "reference", value: createdAA.order.orderNumber }], transactionReference: "mv_found_1" }, token: "token_mvola_test" });
      check(rAA2.status === 200 && rAA2.body.action === "finalized", `AA: référence existante → finalized (${rAA2.status}/${String(rAA2.body.action)})`);
      check((await orderByNumber(createdAA.order.orderNumber))!.status === "paid", "AA: commande retrouvée et payée via metadata.reference");
      log("  OK — contre-preuve mvola : metadata.reference retrouve la commande réelle (paid)");
    }

    check(networkViolation === null, `RÉSEAU EXTERNE INTERDIT déclenché : ${networkViolation ?? ""}`);
    log(`RÉSEAU : aucune requête externe émise — stub réseau intact.`);
    log(`RÉSULTAT : ${failures} échec(s) — TOUS LES TESTS PASSENT. Refund API réels: 0; refund simulés via fake: ${refundCalls}.`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    clearStripeRefundOverride();
    log("Nettoyage et restauration de l'état…");
    await cleanup();

    const after = await countBaseline();
    log(`APRÈS — orders=${after.orders}, certs=${after.certificates}, oi=${after.orderItems}, wt=${after.walletTransactions}, wh=${after.webhookEvents}`);
    if (
      after.orders !== baseline.orders ||
      after.certificates !== baseline.certificates ||
      after.orderItems !== baseline.orderItems ||
      after.walletTransactions !== baseline.walletTransactions ||
      after.webhookEvents !== baseline.webhookEvents ||
      networkViolation !== null
    ) {
      failures++;
      console.error(
        `[verify-webhooks] ASSERTION FAILED: état altéré (avant o=${baseline.orders}, c=${baseline.certificates}, oi=${baseline.orderItems}, wt=${baseline.walletTransactions}, wh=${baseline.webhookEvents} | après o=${after.orders}, c=${after.certificates}, oi=${after.orderItems}, wt=${after.walletTransactions}, wh=${after.webhookEvents}; réseau: ${networkViolation ?? "intact"})`,
      );
      process.exitCode = 1;
    } else {
      log("Nettoyage terminé — comptage identique avant/après, aucune donnée résiduelle.");
    }
  }
}

function randomPart(): string {
  return Math.random().toString(36).slice(2, 8);
}

main().catch((err) => {
  console.error("[verify-webhooks] ERREUR :", err);
  process.exitCode = 1;
});