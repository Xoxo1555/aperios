import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "db";
import { 
  ORDER_STATUS,
  orders, 
  orderItems, 
  users, 
  photos, 
  printsConfig, 
  mounts 
} from "db/schema";
import type { OrderStatus } from "db/schema";
import { getSessionUser } from "lib/auth";

export const dynamic = "force-dynamic";

/** Request schema: the requested status must be one of the canonical
 *  lifecycle statuses — validated through a zod enum over ORDER_STATUS,
 *  never a loosely-normalized string. */
const adminOrderPutSchema = z.object({
  status: z.enum(ORDER_STATUS),
});

/** Money states. A transition touching any of them can ONLY happen through
 *  the business functions (handleConfirmedPayment, markOrderRefundPending,
 *  clawbackOrderCredits, refundOrderToRefunded, …) which move the money
 *  coherently — the plain admin PUT is forbidden to leave or enter them
 *  (I6 amendment 10). */
const MONEY_STATUSES = new Set<OrderStatus>(["paid", "refund_pending", "refunded"]);

/** Statuses the admin PUT may steer directly (no money movement involved). */
const NON_MONEY_STATUSES = ["pending", "cancelled", "shipped", "delivered", "completed"] as const;
type NonMoneyStatus = (typeof NON_MONEY_STATUSES)[number];
const NON_MONEY_STATUS_SET = new Set<OrderStatus>(NON_MONEY_STATUSES);

function isNonMoneyStatus(s: OrderStatus): s is NonMoneyStatus {
  return NON_MONEY_STATUS_SET.has(s);
}

/** Authorized transitions for THIS endpoint. Every transition touching
 *  paid|refund_pending|refunded is deliberately absent from this table: such
 *  moves only happen through the business functions. This table only covers
 *  pre-payment cancellation and fulfilment corrections. */
const ALLOWED_TRANSITIONS: Readonly<Record<NonMoneyStatus, readonly NonMoneyStatus[]>> = {
  pending: ["cancelled"],
  cancelled: ["pending"],
  shipped: ["delivered"],
  delivered: ["completed", "shipped"],
  completed: ["delivered"],
};

/** A transition is blocked when it DEPARTS from or ARRIVES at a money state:
 *  paid|refund_pending|refunded can only be produced/left by business logic. */
function isBlockedTransition(current: OrderStatus, next: OrderStatus): boolean {
  return MONEY_STATUSES.has(next) || MONEY_STATUSES.has(current);
}

/** Only the pairs declared in ALLOWED_TRANSITIONS are reachable here; the
 *  money states are never allowed as source or target. */
function isAuthorizedTransition(current: OrderStatus, next: OrderStatus): boolean {
  if (!isNonMoneyStatus(current) || !isNonMoneyStatus(next)) return false;
  return ALLOWED_TRANSITIONS[current].includes(next);
}

/** GET /api/admin/orders/[orderNumber] - Get a specific order (admin view) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const user = await getSessionUser();
  
  // Check if user is authenticated and is an admin
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { orderNumber } = await params;
  
  try {
    // Fetch the order with related data
    const orderResult = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        userId: orders.userId,
        status: orders.status,
        subtotal: orders.subtotal,
        shipping: orders.shipping,
        tax: orders.tax,
        total: orders.total,
        currency: orders.currency,
        paymentMethod: orders.paymentMethod,
        paymentProvider: orders.paymentProvider,
        paymentRef: orders.paymentRef,
        shipName: orders.shipName,
        shipEmail: orders.shipEmail,
        shipAddress: orders.shipAddress,
        createdAt: orders.createdAt,
        // User data
        userName: users.name,
        userEmail: users.email,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .where(eq(orders.orderNumber, orderNumber));

    if (!orderResult.length) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderResult[0];

    // Fetch order items with related data
    const orderItemsResult = await db
      .select({
        id: orderItems.id,
        photoId: orderItems.photoId,
        printConfigId: orderItems.printConfigId,
        mountId: orderItems.mountId,
        editionNumber: orderItems.editionNumber,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.lineTotal,
        photographerShare: orderItems.photographerShare,
        // Photo data
        photoTitle: photos.title,
        photoImageUrl: photos.imageUrl,
        // Print config data
        printLabel: printsConfig.label,
        printWidthCm: printsConfig.widthCm,
        printHeightCm: printsConfig.heightCm,
        // Mount data
        mountName: mounts.name,
        mountCode: mounts.code,
      })
      .from(orderItems)
      .leftJoin(photos, eq(orderItems.photoId, photos.id))
      .leftJoin(printsConfig, eq(orderItems.printConfigId, printsConfig.id))
      .leftJoin(mounts, eq(orderItems.mountId, mounts.id))
      .where(eq(orderItems.orderId, order.id));

    // Construct the response object
    const orderWithRelations = {
      ...order,
      items: orderItemsResult.map(item => ({
        id: item.id,
        photoId: item.photoId,
        printConfigId: item.printConfigId,
        mountId: item.mountId,
        editionNumber: item.editionNumber,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        photographerShare: item.photographerShare,
        photo: item.photoTitle && item.photoImageUrl ? {
          id: item.photoId,
          title: item.photoTitle,
          imageUrl: item.photoImageUrl,
        } : null,
        printConfig: item.printLabel && item.printWidthCm && item.printHeightCm ? {
          id: item.printConfigId,
          label: item.printLabel,
          widthCm: item.printWidthCm,
          heightCm: item.printHeightCm,
        } : null,
        mount: item.mountName && item.mountCode ? {
          id: item.mountId,
          name: item.mountName,
          code: item.mountCode,
        } : null,
      })),
    };

    return NextResponse.json(orderWithRelations);
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** PUT /api/admin/orders/[orderNumber] - Update a specific order (admin view) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const user = await getSessionUser();
  
  // Check if user is authenticated and is an admin
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { orderNumber } = await params;
  
  try {
    const body = await request.json();
    
    // Validate the requested status against the canonical enum (zod).
    const parsed = adminOrderPutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }
    const nextStatus = parsed.data.status;

    // Check if order exists
    const [existingOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!existingOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    /* Money states are BUSINESS-logic territory: no plain PUT may move an
     * order into or out of paid|refund_pending|refunded without going
     * through the finalization/refund/clawback functions (I6 amendment 10). */
    if (isBlockedTransition(existingOrder.status, nextStatus)) {
      return NextResponse.json(
        {
          error:
            `Transition ${existingOrder.status} → ${nextStatus} refusée : ` +
            "les changements de statut monétaire (paid, refund_pending, refunded) passent par les fonctions métier.",
          code: "BLOCKED_MONEY_TRANSITION",
          currentStatus: existingOrder.status,
          requestedStatus: nextStatus,
        },
        { status: 422 }
      );
    }

    /* No money is involved: the move must still be one of the declared
     * lifecycle pairs (cancellation, fulfilment progress, corrections). */
    if (!isAuthorizedTransition(existingOrder.status, nextStatus)) {
      return NextResponse.json(
        {
          error:
            `Transition ${existingOrder.status} → ${nextStatus} non autorisée : ` +
            "seules les transitions déclarées (cancellation / progression d'exécution) sont possibles via ce endpoint.",
          code: "INVALID_TRANSITION",
          currentStatus: existingOrder.status,
          requestedStatus: nextStatus,
        },
        { status: 422 }
      );
    }

    // Update the order
    await db
      .update(orders)
      .set({ status: nextStatus })
      .where(eq(orders.orderNumber, orderNumber));

    // Fetch the updated order with relations for the response
    const orderResult = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        userId: orders.userId,
        status: orders.status,
        subtotal: orders.subtotal,
        tax: orders.tax,
        total: orders.total,
        currency: orders.currency,
        paymentMethod: orders.paymentMethod,
        paymentProvider: orders.paymentProvider,
        paymentRef: orders.paymentRef,
        shipName: orders.shipName,
        shipEmail: orders.shipEmail,
        shipAddress: orders.shipAddress,
        createdAt: orders.createdAt,
        // User data
        userName: users.name,
        userEmail: users.email,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .where(eq(orders.orderNumber, orderNumber));

    if (!orderResult.length) {
      return NextResponse.json(
        { error: 'Order not found after update' },
        { status: 404 }
      );
    }

    const order = orderResult[0];

    // Fetch order items with related data
    const orderItemsResult = await db
      .select({
        id: orderItems.id,
        photoId: orderItems.photoId,
        printConfigId: orderItems.printConfigId,
        mountId: orderItems.mountId,
        editionNumber: orderItems.editionNumber,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.lineTotal,
        photographerShare: orderItems.photographerShare,
        // Photo data
        photoTitle: photos.title,
        photoImageUrl: photos.imageUrl,
        // Print config data
        printLabel: printsConfig.label,
        printWidthCm: printsConfig.widthCm,
        printHeightCm: printsConfig.heightCm,
        // Mount data
        mountName: mounts.name,
        mountCode: mounts.code,
      })
      .from(orderItems)
      .leftJoin(photos, eq(orderItems.photoId, photos.id))
      .leftJoin(printsConfig, eq(orderItems.printConfigId, printsConfig.id))
      .leftJoin(mounts, eq(orderItems.mountId, mounts.id))
      .where(eq(orderItems.orderId, order.id));

    // Construct the response object
    const orderWithRelations = {
      ...order,
      items: orderItemsResult.map(item => ({
        id: item.id,
        photoId: item.photoId,
        printConfigId: item.printConfigId,
        mountId: item.mountId,
        editionNumber: item.editionNumber,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        photographerShare: item.photographerShare,
        photo: item.photoTitle && item.photoImageUrl ? {
          id: item.photoId,
          title: item.photoTitle,
          imageUrl: item.photoImageUrl,
        } : null,
        printConfig: item.printLabel && item.printWidthCm && item.printHeightCm ? {
          id: item.printConfigId,
          label: item.printLabel,
          widthCm: item.printWidthCm,
          heightCm: item.printHeightCm,
        } : null,
        mount: item.mountName && item.mountCode ? {
          id: item.mountId,
          name: item.mountName,
          code: item.mountCode,
        } : null,
      })),
    };

    return NextResponse.json(orderWithRelations);
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** PATCH /api/admin/orders/[orderNumber] - Partially update a specific order (admin view) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  // Reuse the PUT handler for PATCH since they have similar functionality
  const { orderNumber } = await params;
  return PUT(request, { params: Promise.resolve({ orderNumber }) });
}

/** DELETE /api/admin/orders/[orderNumber] - Delete a specific order (admin view) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const user = await getSessionUser();
  
  // Check if user is authenticated and is an admin
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { orderNumber } = await params;
  
  try {
    // Check if order exists
    const [existingOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!existingOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    const orderId = existingOrder.id;

    // Delete related entities first (due to foreign key constraints)
    // Delete order items
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));

    // Note: The shipAddress is stored as JSONB in the orders table, so no separate address table to delete
    // If there were separate address tables, they would be deleted here

    // Delete the order
    await db.delete(orders).where(eq(orders.orderNumber, orderNumber));

    return NextResponse.json(
      { message: 'Order deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting order:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}