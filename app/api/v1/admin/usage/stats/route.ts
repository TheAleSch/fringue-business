import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseDailyStats } from '@/db/schema';
import { requireAdmin } from '@/lib/admin-auth';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

// GET /api/v1/admin/usage/stats
// Query params:
//   from        YYYY-MM-DD  required  inclusive start date
//   to          YYYY-MM-DD  required  inclusive end date
//   customerId  UUID        optional  omit for global (all customers) view
//   groupBy     day|week|month  optional  default: day

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const customerId = searchParams.get('customerId') ?? undefined;
  const groupByParam = searchParams.get('groupBy') ?? 'day';

  if (!from || !to) {
    return NextResponse.json(
      { error: 'from and to are required (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  // Validate groupBy — use switch to avoid SQL injection
  let dateBucket: SQL<string>;
  switch (groupByParam) {
    case 'week':
      dateBucket = sql<string>`DATE_TRUNC('week', ${enterpriseDailyStats.date})::date::text`;
      break;
    case 'month':
      dateBucket = sql<string>`DATE_TRUNC('month', ${enterpriseDailyStats.date})::date::text`;
      break;
    default: // 'day'
      dateBucket = sql<string>`${enterpriseDailyStats.date}::text`;
  }

  const rows = await db
    .select({
      date: dateBucket,
      successCount: sql<number>`SUM(${enterpriseDailyStats.successCount})::int`,
      failedCount: sql<number>`SUM(${enterpriseDailyStats.failedCount})::int`,
      totalCredits: sql<number>`SUM(${enterpriseDailyStats.totalCredits})::int`,
    })
    .from(enterpriseDailyStats)
    .where(
      and(
        gte(enterpriseDailyStats.date, from),
        lte(enterpriseDailyStats.date, to),
        customerId ? eq(enterpriseDailyStats.customerId, customerId) : undefined,
      )
    )
    .groupBy(dateBucket)
    .orderBy(dateBucket);

  const summary = rows.reduce(
    (acc, row) => ({
      totalSuccess: acc.totalSuccess + row.successCount,
      totalFailed:  acc.totalFailed  + row.failedCount,
      totalCredits: acc.totalCredits + row.totalCredits,
      totalJobs:    acc.totalJobs    + row.successCount + row.failedCount,
    }),
    { totalSuccess: 0, totalFailed: 0, totalCredits: 0, totalJobs: 0 }
  );

  const successRate =
    summary.totalJobs > 0
      ? Math.round((summary.totalSuccess / summary.totalJobs) * 1000) / 10
      : 0;

  return NextResponse.json({
    data: rows,
    summary: { ...summary, successRate },
  });
}
