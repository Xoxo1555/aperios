import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and, count, isNotNull, type SQL } from "drizzle-orm";
import { randomInt } from "crypto";
import { db } from "db";
import { 
  orders, 
  orderItems, 
  users, 
  photos, 
  printsConfig, 
  mounts 
} from "db/schema";
import { getSessionUser } from "lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/admin/orders - List all orders (admin view) */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  
  // Check if user is authenticated and is an admin
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const dispute = searchParams.get('dispute');
    const offset = (page - 1) * limit;

    // Build where conditions
    const whereConditions: SQL[] = [];
    if (status) {
      // Canonical ORDER_STATUS includes "refund_pending" / "refunded": those
      // filters are fully accepted (I6 clôture — tâche 2).
      whereConditions.push(eq(orders.status, status as (typeof orders.status)["enumValues"][number]));
    }
    // "Litige ouvert" : disputed_at posé et vente non encore refundée (une
    // commande disputée passée au terminal refunded n'est plus un litige ouvert).
    if (dispute === "open") {
      whereConditions.push(isNotNull(orders.disputedAt));
      whereConditions.push(eq(orders.status, "paid"));
    }

    // Fetch orders with pagination and related data
    const ordersResult = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        userId: orders.userId,
        status: orders.status,
        refundReason: orders.refundReason,
        refundId: orders.refundId,
        refundedAt: orders.refundedAt,
        disputedAt: orders.disputedAt,
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
      .where(and(...whereConditions))
      .orderBy(desc(orders.createdAt))
      .offset(offset)
      .limit(limit);

    // Get total count for pagination
    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(orders)
      .where(and(...whereConditions));

    // Format orders for response (without expanding relations for list view)
    const formattedOrders = ordersResult.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status,
      refundReason: order.refundReason,
      refundId: order.refundId,
      refundedAt: order.refundedAt,
      disputedAt: order.disputedAt,
      subtotal: order.subtotal,
      shipping: order.shipping,
      tax: order.tax,
      total: order.total,
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      paymentProvider: order.paymentProvider,
      paymentRef: order.paymentRef,
      shipName: order.shipName,
      shipEmail: order.shipEmail,
      shipAddress: order.shipAddress,
      createdAt: order.createdAt,
      userName: order.userName,
      userEmail: order.userEmail,
    }));

    return NextResponse.json({
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total: Number(totalCount),
        pages: Math.ceil(Number(totalCount) / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

/** POST /api/admin/orders - Create a new order (admin view) */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  
  // Check if user is authenticated and is an admin
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const {
      userId,
      items,
      shippingAddress,
      paymentMethod,
      subtotal,
      tax,
      shippingCost,
      total,
    } = body;

    // Validate required fields
    if (!userId || !items || !shippingAddress || !paymentMethod || !total) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create the order
    const orderNumber = `APR-${new Date().getFullYear()}-${randomInt(100000, 999999)}`;
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber,
        userId: parseInt(userId),
        status: 'pending',
        subtotal: String(parseFloat(subtotal)),
        tax: String(parseFloat(tax) || 0),
        shipping: String(parseFloat(shippingCost) || 0),
        total: String(parseFloat(total)),
        currency: 'EUR',
        paymentMethod,
        paymentProvider: paymentMethod, // Assuming same as method for simplicity
        paymentRef: null,
        shipName: shippingAddress.name || '',
        shipEmail: shippingAddress.email || '',
        shipAddress: JSON.stringify(shippingAddress),
      })
      .returning();

    // Create order items if provided
    if (items && Array.isArray(items)) {
      const orderItemsToInsert = items.map((item: any) => ({
        orderId: order.id,
        photoId: item.photoId,
        printConfigId: item.printConfigId,
        mountId: item.mountId,
        editionNumber: item.editionNumber,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        lineTotal: String(item.unitPrice * item.quantity),
        photographerShare: null, // Will be calculated later if needed
      }));

      if (orderItemsToInsert.length > 0) {
        await db.insert(orderItems).values(orderItemsToInsert);
      }
    }

    // Fetch the created order with relations for response
    const orderResult = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        userId: orders.userId,
        status: orders.status,
        refundReason: orders.refundReason,
        refundId: orders.refundId,
        refundedAt: orders.refundedAt,
        disputedAt: orders.disputedAt,
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
      .where(eq(orders.id, order.id));

    if (!orderResult.length) {
      return NextResponse.json(
        { error: 'Order not found after creation' },
        { status: 404 }
      );
    }

    const createdOrder = orderResult[0];

    // Fetch order items for the created order
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
      .where(eq(orderItems.orderId, createdOrder.id));

    // Construct the response object
    const orderWithRelations = {
      ...createdOrder,
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

    return NextResponse.json(orderWithRelations, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}