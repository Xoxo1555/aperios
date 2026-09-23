import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { collections } from "db/schema";
import { getSessionUser } from "lib/auth";
import { fetchMyCollections } from "lib/queries";
import { slugify } from "lib/utils";
import { collectionCreateSchema } from "lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const list = await fetchMyCollections(user.id);
  return NextResponse.json({ collections: list });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const raw = await req.json().catch(() => ({}));
  const parsed = collectionCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Le nom de la collection est requis." }, { status: 400 });
  }
  const name = parsed.data.name;
  const [created] = await db
    .insert(collections)
    .values({ userId: user.id, name, slug: `tmp-${Date.now().toString(36)}` })
    .returning();
  await db
    .update(collections)
    .set({ slug: `${slugify(name) || "collection"}-${created.id}` })
    .where(eq(collections.id, created.id));

  return NextResponse.json(
    {
      collection: {
        id: created.id,
        name,
        slug: `${slugify(name) || "collection"}-${created.id}`,
        description: null,
        isPublic: true,
        photoCount: 0,
        coverUrl: null,
      },
    },
    { status: 201 },
  );
}
