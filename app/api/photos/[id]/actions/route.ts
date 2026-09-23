import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookmarks, comments, likes, photos, shares } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { photoIdParamSchema, photoCommentSchema, photoShareSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rawId = (await params).id;
  const parsedId = photoIdParamSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid photo id." }, { status: 400 });
  }
  const id = parsedId.data;

  /* Reject interactions with photos that do not exist (blocks garbage writes). */
  const [exists] = await db
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);
  if (!exists) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  const user = await getSessionUser();
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  switch (action) {
    case "like": {
      if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      // Insertion atomique : on n'incrémente le compteur que si une ligne
      // a réellement été insérée (pas de double-like possible).
      const inserted = await db
        .insert(likes)
        .values({ userId: user.id, photoId: id })
        .onConflictDoNothing()
        .returning({ photoId: likes.photoId });
      if (inserted.length > 0) {
        await db
          .update(photos)
          .set({ likesCount: sql`${photos.likesCount} + 1` })
          .where(eq(photos.id, id));
      }
      return NextResponse.json({ ok: true, liked: true });
    }
    case "unlike": {
      if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      // Suppression atomique : on ne décrémente le compteur que si une ligne
      // a réellement été supprimée, sans jamais passer sous zéro.
      const deleted = await db
        .delete(likes)
        .where(and(eq(likes.userId, user.id), eq(likes.photoId, id)))
        .returning({ photoId: likes.photoId });
      if (deleted.length > 0) {
        await db
          .update(photos)
          .set({ likesCount: sql`greatest(${photos.likesCount} - 1, 0)` })
          .where(eq(photos.id, id));
      }
      return NextResponse.json({ ok: true, liked: false });
    }
    case "download": {
      await db
        .update(photos)
        .set({ downloads: sql`${photos.downloads} + 1` })
        .where(eq(photos.id, id));
      return NextResponse.json({ ok: true });
    }
    case "bookmark": {
      if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      await db
        .insert(bookmarks)
        .values({ userId: user.id, photoId: id })
        .onConflictDoNothing();
      return NextResponse.json({ ok: true, bookmarked: true });
    }
    case "unbookmark": {
      if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      await db
        .delete(bookmarks)
        .where(and(eq(bookmarks.userId, user.id), eq(bookmarks.photoId, id)));
      return NextResponse.json({ ok: true, bookmarked: false });
    }
    case "share": {
      const parsed = photoShareSchema.safeParse(body);
      const platform = parsed.success ? (parsed.data.platform ?? null) : null;
      await db.insert(shares).values({ photoId: id, platform });
      return NextResponse.json({ ok: true });
    }
    case "comment": {
      if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      const parsed = photoCommentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
      }
      await db
        .insert(comments)
        .values({ userId: user.id, photoId: id, content: parsed.data.message });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}