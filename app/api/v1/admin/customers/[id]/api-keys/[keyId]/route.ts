import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseApiKeys } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';

type Params = { params: Promise<{ id: string; keyId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id: customerId, keyId } = await params;

  const [updated] = await db
    .update(enterpriseApiKeys)
    .set({ isActive: false })
    .where(and(eq(enterpriseApiKeys.id, keyId), eq(enterpriseApiKeys.customerId, customerId)))
    .returning({ id: enterpriseApiKeys.id });

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, revoked: { key_id: updated.id } });
}
