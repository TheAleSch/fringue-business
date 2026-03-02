import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseCustomers, enterpriseCreditTransactions } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id: customerId } = await params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

  const customer = await db.query.enterpriseCustomers.findFirst({
    where: eq(enterpriseCustomers.id, customerId),
  });
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [transactions, [{ count }]] = await Promise.all([
    db.select()
      .from(enterpriseCreditTransactions)
      .where(eq(enterpriseCreditTransactions.customerId, customerId))
      .orderBy(desc(enterpriseCreditTransactions.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`COUNT(*)::int` })
      .from(enterpriseCreditTransactions)
      .where(eq(enterpriseCreditTransactions.customerId, customerId)),
  ]);

  return NextResponse.json({
    balance: customer.creditBalance,
    transactions,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  // Business rule: credit adjustments are an admin-only operation.
  // This is enforced here at the data layer, independent of upstream auth.
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id: customerId } = await params;
  const body = await request.json();
  const { amount, description } = body;

  if (typeof amount !== 'number' || amount === 0) {
    return NextResponse.json(
      { error: 'amount must be a non-zero number (positive = add, negative = deduct)' },
      { status: 400 }
    );
  }

  const customer = await db.query.enterpriseCustomers.findFirst({
    where: eq(enterpriseCustomers.id, customerId),
  });
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const actionType = amount > 0 ? 'admin_add' : 'admin_deduct';

  try {
    const result = await db.transaction(async (tx) => {
      // Atomic update: the arithmetic happens in a single SQL statement so
      // concurrent requests cannot interleave a read-compute-write cycle.
      // The WHERE condition on credit_balance guarantees the balance never
      // goes negative without a separate round-trip check (TOCTOU-safe).
      const [updated] = await tx
        .update(enterpriseCustomers)
        .set({
          creditBalance: sql`credit_balance + ${amount}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(enterpriseCustomers.id, customerId),
            sql`credit_balance + ${amount} >= 0`
          )
        )
        .returning({ creditBalance: enterpriseCustomers.creditBalance });

      if (!updated) {
        throw new Error('INSUFFICIENT_CREDITS');
      }

      const [txn] = await tx
        .insert(enterpriseCreditTransactions)
        .values({
          customerId,
          amount,
          actionType,
          description: description || null,
          balanceAfter: updated.creditBalance,
        })
        .returning();

      return { balance: updated.creditBalance, transaction_id: txn.id };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_CREDITS') {
      return NextResponse.json({ error: 'Insufficient credits for deduction' }, { status: 400 });
    }
    throw err;
  }
}
