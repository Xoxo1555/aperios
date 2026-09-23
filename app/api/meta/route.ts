import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "db";
import { categories, mounts, photoTags, printsConfig, tags } from "db/schema";
import { categoryToDto } from "lib/dto";

export const dynamic = "force-dynamic";

export async function GET() {
  const [categoryRows, sizeRows, mountRows, tagRows] = await Promise.all([
    db.select().from(categories).orderBy(categories.sort),
    db.select().from(printsConfig).orderBy(printsConfig.sort),
    db.select().from(mounts).orderBy(mounts.sort),
    db
      .select({ name: tags.name, slug: tags.slug, count: photoTags.tagId })
      .from(tags)
      .leftJoin(photoTags, eq(photoTags.tagId, tags.id))
      .orderBy(desc(photoTags.tagId))
      .limit(60),
  ]);

  return NextResponse.json({
    categories: categoryRows.map(categoryToDto),
    sizes: sizeRows.map((r) => ({
      id: r.id,
      label: r.label,
      widthCm: r.widthCm,
      heightCm: r.heightCm,
      multiplier: parseFloat(r.multiplier),
    })),
    mounts: mountRows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      multiplier: parseFloat(r.multiplier),
      surcharge: parseFloat(r.surcharge),
    })),
    tags: tagRows.map((t) => t.name),
  });
}
