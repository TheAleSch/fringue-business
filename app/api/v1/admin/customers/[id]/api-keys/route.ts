import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseApiKeys } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';
import { generateApiKey } from '@/lib/enterprise-auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id: customerId } = await params;
  const keys = await db
    .select({
      id: enterpriseApiKeys.id,
      customerId: enterpriseApiKeys.customerId,
      name: enterpriseApiKeys.name,
      keyPrefix: enterpriseApiKeys.keyPrefix,
      isActive: enterpriseApiKeys.isActive,
      lastUsedAt: enterpriseApiKeys.lastUsedAt,
      expiresAt: enterpriseApiKeys.expiresAt,
      createdAt: enterpriseApiKeys.createdAt,
    })
    .from(enterpriseApiKeys)
    .where(eq(enterpriseApiKeys.customerId, customerId));

  return NextResponse.json({ items: keys, total: keys.length });
}

export async function POST(request: NextRequest, { params }: Params) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id: customerId } = await params;
  const body = await request.json();
  const { name, expiresAt } = body;

  if (!name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
  }

  const { fullKey, keyHash, keyPrefix } = generateApiKey();

  const [key] = await db
    .insert(enterpriseApiKeys)
    .values({
      customerId,
      name,
      keyHash,
      keyPrefix,
      ...(expiresAt && { expiresAt: new Date(expiresAt) }),
    })
    .returning();

  // Return fullKey ONCE — it is never stored and cannot be recovered
  return NextResponse.json(
    {
      success: true,
      api_key: fullKey,
      key: { ...key, keyHash: undefined },
    },
    { status: 201 }
  );
}
