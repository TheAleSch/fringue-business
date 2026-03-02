import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseCustomers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const customer = await db.query.enterpriseCustomers.findFirst({
    where: eq(enterpriseCustomers.id, id),
  });

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ customer });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();
  const { name, contactEmail, isActive, rpmLimit, creditsPerRequest, allowedModels, defaultModel } = body;

  const [updated] = await db
    .update(enterpriseCustomers)
    .set({
      ...(name !== undefined && { name }),
      ...(contactEmail !== undefined && { contactEmail }),
      ...(isActive !== undefined && { isActive }),
      ...(rpmLimit !== undefined && { rpmLimit }),
      ...(creditsPerRequest !== undefined && { creditsPerRequest }),
      ...(allowedModels !== undefined && { allowedModels }),
      ...(defaultModel !== undefined && { defaultModel }),
      updatedAt: new Date(),
    })
    .where(eq(enterpriseCustomers.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, customer: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  const [deleted] = await db
    .delete(enterpriseCustomers)
    .where(eq(enterpriseCustomers.id, id))
    .returning({ id: enterpriseCustomers.id });

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, deleted: { customer_id: deleted.id } });
}
