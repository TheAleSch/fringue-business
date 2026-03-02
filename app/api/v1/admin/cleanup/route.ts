import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseProcessingJobs, enterpriseRpmCounters } from '@/db/schema';
import { and, inArray, lt, ne, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/admin-auth';
import { getStorageProvider } from '@/lib/storage-provider';

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  // Find expired jobs (not currently processing)
  const expired = await db
    .select({
      id: enterpriseProcessingJobs.id,
      resultImagePath: enterpriseProcessingJobs.resultImagePath,
    })
    .from(enterpriseProcessingJobs)
    .where(
      and(
        lt(enterpriseProcessingJobs.expiresAt, new Date()),
        ne(enterpriseProcessingJobs.status, 'processing')
      )
    );

  // Delete R2 files
  const storage = getStorageProvider();
  const r2Errors: string[] = [];
  for (const job of expired) {
    if (job.resultImagePath) {
      await storage.deleteFile(job.resultImagePath).catch((e) => {
        r2Errors.push(`${job.id}: ${e.message}`);
      });
    }
  }

  // Delete expired job rows
  let deletedJobs = 0;
  if (expired.length > 0) {
    const result = await db
      .delete(enterpriseProcessingJobs)
      .where(inArray(enterpriseProcessingJobs.id, expired.map((j) => j.id)))
      .returning({ id: enterpriseProcessingJobs.id });
    deletedJobs = result.length;
  }

  // Delete old RPM counters (older than 1 hour)
  const deletedRpm = await db
    .delete(enterpriseRpmCounters)
    .where(lt(enterpriseRpmCounters.windowStart, sql`NOW() - INTERVAL '1 hour'`))
    .returning({ id: enterpriseRpmCounters.id });

  return NextResponse.json({
    success: true,
    deleted_jobs: deletedJobs,
    deleted_rpm_rows: deletedRpm.length,
    r2_errors: r2Errors,
  });
}
