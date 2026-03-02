import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseCustomers, enterpriseCreditTransactions } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
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
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id: customerId } = await params;
  const body = await request.json();
  const { amount, description } = body;

  if (typeof amount !== 'number' || amount === 0) {
    return NextResponse.json({ error: 'amount must be a non-zero number (positive = add, negative = deduct)' }, { status: 400 });
  }

  const customer = await db.query.enterpriseCustomers.findFirst({
    where: eq(enterpriseCustomers.id, customerId),
  });
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const newBalance = customer.creditBalance + amount;
  if (newBalance < 0) {
    return NextResponse.json({ error: 'Insufficient credits for deduction' }, { status: 400 });
  }

  const actionType = amount > 0 ? 'admin_add' : 'admin_deduct';

  await db.update(enterpriseCustomers)
    .set({ creditBalance: newBalance, updatedAt: new Date() })
    .where(eq(enterpriseCustomers.id, customerId));

  const [txn] = await db.insert(enterpriseCreditTransactions)
    .values({
      customerId,
      amount,
      actionType,
      description: description || null,
      balanceAfter: newBalance,
    })
    .returning();

  return NextResponse.json({
    success: true,
    balance: newBalance,
    transaction_id: txn.id,
  });
}
