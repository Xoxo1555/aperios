import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { photos } from "db/schema";
import { getSessionUser } from "lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const photoId = parseInt(id, 10);

  if (isNaN(photoId)) {
    return NextResponse.json({ error: "Invalid photo id" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  const photo = rows[0];

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  if (photo.photographerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [updatedPhoto] = await db
    .update(photos)
    .set({ isPublished: true })
    .where(eq(photos.id, photoId))
    .returning();

  return NextResponse.json({ photo: updatedPhoto }, { status: 200 });
}