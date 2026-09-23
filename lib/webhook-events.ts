import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "db";
import { webhookEvents, type WebhookEventStatus } from "db/schema";
import { isUniqueViolation } from "./pg-errors";

/**
 * Deduplicated audit trail of payment webhook deliveries (I6 amendment 8).
 *
 * EVERY handled notification is INSERTED here (status `received`) BEFORE any
 * side effect; the unique `(provider, event_id)` key makes a replay a no-op.
 * Signature verification happens upstream, before this store is ever touched.
 *
 * Outcomes:
 *   - `new`              → first delivery, caller must now process the event;
 *   - `already-processed`→ this event id has reached a terminal state (200);
 *   - `received`        → an earlier delivery crashed with a 5xx (still
 *                          `received`): the caller MAY reprocess; all its
 *                          effects are guarded (status flips, refund idempotency).
 */

export type WebhookProvider = "stripe" | "orange_money" | "mvola" | "airtel_money";

export type ClaimOutcome =
  | { status: "new" }
  | { status: "already-processed" }
  | { status: "received" };

function payloadToJson(payload: unknown): unknown | null {
  try {
    return payload ?? null;
  } catch {
    return null;
  }
}

/** Records the delivery and returns how to proceed. */
export async function claimWebhookEvent(
  provider: WebhookProvider,
  eventId: string,
  payload?: unknown,
): Promise<ClaimOutcome> {
  try {
    await db.insert(webhookEvents).values({
      provider,
      eventId,
      status: "received",
      payload: payloadToJson(payload) as never,
    });
    return { status: "new" };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const [existing] = await db
      .select({ status: webhookEvents.status })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)))
      .limit(1);
    if (!existing) return { status: "new" };
    if (existing.status === "processed") return { status: "already-processed" };
    // "received" or "unmatched" → a previous attempt failed (5xx) or the
    // event was orphaned; reprocessing is safe thanks to guarded flips.
    return { status: "received" };
  }
}

async function resolveStatus(
  provider: WebhookProvider,
  eventId: string,
  status: WebhookEventStatus,
  orderNumber?: string | null,
  error?: string | null,
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({
      status,
      orderNumber: orderNumber ?? null,
      error: error ?? null,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)));
}

/** Terminal: the event was fully handled (finalized / refunded / no-op). */
export async function markWebhookEventProcessed(
  provider: WebhookProvider,
  eventId: string,
  orderNumber?: string | null,
): Promise<void> {
  await resolveStatus(provider, eventId, "processed", orderNumber, null);
}

/** Terminal: the referenced order could not be found (orphan event). */
export async function markWebhookEventUnmatched(
  provider: WebhookProvider,
  eventId: string,
): Promise<void> {
  await resolveStatus(provider, eventId, "unmatched", null, "order-not-found");
}

/** Non-terminal: the handling attempt failed (5xx). The row STAYS
 *  `received` so a replay may retry; `error` records the last failure for
 *  diagnosis. */
export async function noteWebhookEventError(
  provider: WebhookProvider,
  eventId: string,
  error: unknown,
  orderNumber?: string | null,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(webhookEvents)
    .set({
      orderNumber: orderNumber ?? null,
      error: message.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)));
}