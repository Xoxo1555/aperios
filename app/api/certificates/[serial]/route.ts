import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  certificates,
  mounts,
  orderItems,
  orders,
  photos,
  printsConfig,
  users,
} from '@/db/schema'
import { requireAdmin } from '@/lib/auth'
import { certificateUpdateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** GET /api/certificates/[serial] - Verify a certificate of authenticity (public) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ serial: string }> }
) {
  try {
    const { serial } = await params

    const rows = await db
      .select({
        cert: certificates,
        item: orderItems,
        photo: photos,
        photographer: users,
        order: orders,
        size: printsConfig,
        mount: mounts,
      })
      .from(certificates)
      .innerJoin(orderItems, eq(certificates.orderItemId, orderItems.id))
      .innerJoin(photos, eq(certificates.photoId, photos.id))
      .innerJoin(users, eq(photos.photographerId, users.id))
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(printsConfig, eq(orderItems.printConfigId, printsConfig.id))
      .leftJoin(mounts, eq(orderItems.mountId, mounts.id))
      .where(eq(certificates.serialNumber, serial))
      .limit(1)

    const row = rows[0]
    if (!row) {
      return NextResponse.json(
        { error: 'Certificate not found' },
        { status: 404 }
      )
    }

    const { cert, item, photo, photographer, order, size, mount } = row

    return NextResponse.json({
      certificate: {
        serialNumber: cert.serialNumber,
        watermarkHash: cert.watermarkHash,
        issuedAt: cert.issuedAt,
        /* Set → the certificate was revoked (refunded/disputed order).
         * Consumers (page, PDF, scam checkers) MUST display "révoqué". */
        revokedAt: cert.revokedAt,
        status: cert.revokedAt ? 'revoked' : 'valid',
      },
      photo: {
        id: photo.id,
        title: photo.title,
        slug: photo.slug,
        imageUrl: photo.imageUrl,
        basePrice: photo.basePrice,
        editionNumber: item.editionNumber,
        totalEditions: photo.totalEditions,
      },
      photographer: {
        id: photographer.id,
        name: photographer.name,
        email: photographer.email,
      },
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        status: order.status,
      },
      printConfig: size
        ? {
            id: size.id,
            label: size.label,
            widthCm: size.widthCm,
            heightCm: size.heightCm,
          }
        : null,
      mount: mount
        ? {
            id: mount.id,
            name: mount.name,
            code: mount.code,
          }
        : null,
    })
  } catch (error) {
    console.error('Error fetching certificate:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/** PUT /api/certificates/[serial] - Update a certificate (admin only) */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ serial: string }> }
) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json(
      { error: 'Réservé aux administrateurs.' },
      { status: user ? 403 : 401 }
    )
  }

  const { serial } = await params

  const raw = await request.json().catch(() => ({}))
  const parsed = certificateUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    )
  }

  const [existing] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.serialNumber, serial))
    .limit(1)

  if (!existing) {
    return NextResponse.json(
      { error: 'Certificate not found' },
      { status: 404 }
    )
  }

  const [certificate] = await db
    .update(certificates)
    .set({
      issuedAt: parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : existing.issuedAt,
    })
    .where(eq(certificates.serialNumber, serial))
    .returning()

  return NextResponse.json(certificate)
}

/** DELETE /api/certificates/[serial] - Delete a certificate (admin only) */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ serial: string }> }
) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json(
      { error: 'Réservé aux administrateurs.' },
      { status: user ? 403 : 401 }
    )
  }

  const { serial } = await params

  const [existing] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.serialNumber, serial))
    .limit(1)

  if (!existing) {
    return NextResponse.json(
      { error: 'Certificate not found' },
      { status: 404 }
    )
  }

  await db.delete(certificates).where(eq(certificates.serialNumber, serial))

  return new NextResponse(null, { status: 204 })
}