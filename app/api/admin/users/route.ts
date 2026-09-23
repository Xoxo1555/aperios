import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import { getSessionUser } from "lib/auth";

export const dynamic = "force-dynamic";

type Role = (typeof users)["role"]["enumValues"][number];

/** GET /api/admin/users — paginated list of users (admin dashboard "Users"
 *  view) with role/name/email filtering and each user's available balance. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25") || 25));
  const role = searchParams.get("role") as Role | null;
  const q = searchParams.get("q")?.trim() ?? "";

  const where: SQL[] = [];
  if (role) where.push(eq(users.role, role));
  if (q) where.push(or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`))!);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      availableBalance: users.availableBalance,
      payoutEnabled: users.payoutEnabled,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...where))
    .orderBy(desc(users.createdAt))
    .offset((page - 1) * limit)
    .limit(limit);

  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(...where));

  return NextResponse.json({
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      availableBalance: r.availableBalance,
      payoutEnabled: r.payoutEnabled,
      emailVerified: r.emailVerified,
      createdAt: r.createdAt.toISOString(),
    })),
    total: Number(totalCount),
    page,
    limit,
    pages: Math.ceil(Number(totalCount) / limit),
  });
}
