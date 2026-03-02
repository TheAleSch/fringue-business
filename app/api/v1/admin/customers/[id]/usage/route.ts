import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseCustomers, enterpriseProcessingJobs } from '@/db/schema';
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

  const [jobs, [{ count }]] = await Promise.all([
    db.select({
      id: enterpriseProcessingJobs.id,
      status: enterpriseProcessingJobs.status,
      itemName: enterpriseProcessingJobs.itemName,
      modelUsed: enterpriseProcessingJobs.modelUsed,
      creditsDeducted: enterpriseProcessingJobs.creditsDeducted,
      metadata: enterpriseProcessingJobs.metadata,
      processingStartedAt: enterpriseProcessingJobs.processingStartedAt,
      processingCompletedAt: enterpriseProcessingJobs.processingCompletedAt,
      createdAt: enterpriseProcessingJobs.createdAt,
    })
      .from(enterpriseProcessingJobs)
      .where(eq(enterpriseProcessingJobs.customerId, customerId))
      .orderBy(desc(enterpriseProcessingJobs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`COUNT(*)::int` })
      .from(enterpriseProcessingJobs)
      .where(eq(enterpriseProcessingJobs.customerId, customerId)),
  ]);

  return NextResponse.json({
    items: jobs,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  });
}
