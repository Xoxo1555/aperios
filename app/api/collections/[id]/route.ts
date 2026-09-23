import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionPhotos, collections, photos } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { collectionActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const collectionId = parseInt((await params).id, 10);
  const raw = await req.json().catch(() => ({}));
  const parsed = collectionActionSchema.safeParse(raw);
  if (!parsed.success || Number.isNaN(collectionId) || collectionId <= 0) {
    return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  }
  const { action, photoId } = parsed.data;

  const owned = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, user.id)))
    .limit(1);
  if (!owned[0]) {
    return NextResponse.json({ error: "Collection not found." }, { status: 404 });
  }

  const photoExists = await db
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  if (!photoExists[0]) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  if (action === "add") {
    await db.insert(collectionPhotos).values({ collectionId, photoId }).onConflictDoNothing();
  } else if (action === "remove") {
    await db
      .delete(collectionPhotos)
      .where(and(eq(collectionPhotos.collectionId, collectionId), eq(collectionPhotos.photoId, photoId)));
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
