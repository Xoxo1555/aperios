import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { payouts, users } from "db/schema";
import { getSessionUser } from "lib/auth";
import { payoutStatusSchema } from "lib/validation";
import { syncPayoutLedger } from "lib/wallet";

export const dynamic = "force-dynamic";

/** GET /api/payouts/[id] - Get a specific payout by ID */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const payoutId = parseInt(id);
  if (isNaN(payoutId)) {
    return NextResponse.json({ error: "Invalid payout ID" }, { status: 400 });
  }

  const [payout] = await db
    .select({
      id: payouts.id,
      userId: payouts.userId,
      reference: payouts.reference,
      amount: payouts.amount,
      method: payouts.method,
      account: payouts.account,
      accountName: payouts.accountName,
      status: payouts.status,
      processedAt: payouts.processedAt,
      createdAt: payouts.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(payouts)
    .innerJoin(users, eq(payouts.userId, users.id))
    .where(eq(payouts.id, payoutId))
    .limit(1);

  if (!payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  // Check if the user owns this payout or is an admin
  if (payout.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json({ payout });
}

/** PUT /api/payouts/[id] - Update payout status (admin only) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const payoutId = parseInt(id);
  if (isNaN(payoutId)) {
    return NextResponse.json({ error: "Invalid payout ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = payoutStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Statut invalide (pending, processing, completed, failed)." },
      { status: 400 }
    );
  }
  const { status } = parsed.data;

  // Check if payout exists
  const [existingPayout] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.id, payoutId))
    .limit(1);

  if (!existingPayout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  // Update the payout status
  const [updatedPayout] = await db
    .update(payouts)
    .set({
      status,
      processedAt: status === "completed" || status === "failed" ? new Date() : null,
    })
    .where(eq(payouts.id, payoutId))
    .returning({
      id: payouts.id,
      reference: payouts.reference,
      amount: payouts.amount,
      method: payouts.method,
      account: payouts.account,
      accountName: payouts.accountName,
      status: payouts.status,
      processedAt: payouts.processedAt,
      createdAt: payouts.createdAt,
    });

  // Keep the wallet ledger history in sync with the final payout status.
  await syncPayoutLedger(existingPayout.reference, status);

  return NextResponse.json({ payout: updatedPayout });
}

/** PATCH /api/payouts/[id] - Partially update payout (alias for PUT) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return PUT(request, { params: Promise.resolve({ id }) });
}