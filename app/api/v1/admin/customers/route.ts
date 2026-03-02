import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseCustomers } from '@/db/schema';
import { desc, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

  const [items, [{ count }]] = await Promise.all([
    db.select()
      .from(enterpriseCustomers)
      .orderBy(desc(enterpriseCustomers.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(enterpriseCustomers),
  ]);

  return NextResponse.json({
    items,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  });
}

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const body = await request.json();
  const { name, slug, contactEmail, creditBalance, creditsPerRequest, rpmLimit } = body;

  if (!name || !slug || !contactEmail) {
    return NextResponse.json({ error: 'Missing required fields: name, slug, contactEmail' }, { status: 400 });
  }

  const [customer] = await db
    .insert(enterpriseCustomers)
    .values({
      name,
      slug,
      contactEmail,
      ...(creditBalance !== undefined && { creditBalance }),
      ...(creditsPerRequest !== undefined && { creditsPerRequest }),
      ...(rpmLimit !== undefined && { rpmLimit }),
    })
    .returning();

  return NextResponse.json({ success: true, customer }, { status: 201 });
}
