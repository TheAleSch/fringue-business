import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseProcessingJobs } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyEnterpriseKey } from '@/lib/enterprise-auth';
import { createSignedUrl } from '@/lib/storage-provider';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ processingId: string }> }
) {
  const auth = await verifyEnterpriseKey(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { processingId } = await params;

  const job = await db.query.enterpriseProcessingJobs.findFirst({
    where: and(
      eq(enterpriseProcessingJobs.id, processingId),
      eq(enterpriseProcessingJobs.customerId, auth.customer.id)
    ),
  });

  if (!job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (job.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Result has expired' }, { status: 410 });
  }

  let resultUrl = job.resultSignedUrl;
  let resultUrlExpiresAt = job.resultUrlExpiresAt;

  // Refresh signed URL if expired or missing
  if (job.resultImagePath && (!resultUrl || !resultUrlExpiresAt || resultUrlExpiresAt < new Date())) {
    const newUrl = await createSignedUrl(job.resultImagePath);
    const newExpiry = new Date(Date.now() + 1800 * 1000);
    await db
      .update(enterpriseProcessingJobs)
      .set({ resultSignedUrl: newUrl, resultUrlExpiresAt: newExpiry })
      .where(eq(enterpriseProcessingJobs.id, job.id));
    resultUrl = newUrl;
    resultUrlExpiresAt = newExpiry;
  }

  return NextResponse.json({
    processing_id: job.id,
    status: job.status,
    result_url: resultUrl ?? undefined,
    result_url_expires_at: resultUrlExpiresAt?.toISOString() ?? undefined,
    error: job.errorMessage ?? undefined,
    credits_deducted: job.creditsDeducted ?? undefined,
    model_used: job.modelUsed,
    metadata: job.metadata ?? undefined,
    created_at: job.createdAt.toISOString(),
    processing_completed_at: job.processingCompletedAt?.toISOString() ?? undefined,
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 200 });
}
