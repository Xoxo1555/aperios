import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { comments, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { photoIdParamSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const parsed = photoIdParamSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant de photo invalide." }, { status: 400 });
  }
  const photoId = parsed.data;

  const commentRows = await db
    .select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      user: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.photoId, photoId))
    .orderBy(desc(comments.createdAt))
    .limit(100);

  return NextResponse.json({ comments: commentRows });
}