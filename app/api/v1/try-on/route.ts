import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { enterpriseProcessingJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyEnterpriseKey, checkAndIncrementRpm } from '@/lib/enterprise-auth';
import { deductEnterpriseCredits } from '@/lib/enterprise-credits';
import { generateImageWithGemini, AI_PROMPTS } from '@/lib/ai';
import { optimizeImage } from '@/lib/storage';
import { getStorageProvider, createSignedUrl } from '@/lib/storage-provider';
import { createSSEStream } from '@/lib/sse';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Pre-stream checks — return plain JSON errors
  const auth = await verifyEnterpriseKey(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rpm = await checkAndIncrementRpm(auth.apiKey.id, auth.customer.rpmLimit);
  if (!rpm.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rpm.retryAfterSeconds) } }
    );
  }

  if (auth.customer.creditBalance < auth.customer.creditsPerRequest) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 403 });
  }

  let body: { person_image?: string; clothing_image?: string; item_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { person_image, clothing_image, item_name } = body;
  if (!person_image || !clothing_image || !item_name) {
    return NextResponse.json({ error: 'Missing required fields: person_image, clothing_image, item_name' }, { status: 400 });
  }

  // Open SSE stream
  return createSSEStream(async (send) => {
    const startTime = Date.now();
    const { customer, apiKey } = auth;
    let processingId: string | undefined;

    try {
      // 1. Insert job row — always before AI call so partner can poll
      const [job] = await db
        .insert(enterpriseProcessingJobs)
        .values({
          customerId: customer.id,
          apiKeyId: apiKey.id,
          itemName: item_name,
          modelUsed: customer.defaultModel,
        })
        .returning({ id: enterpriseProcessingJobs.id });
      processingId = job.id;

      await send({ step: 'processing', progress: 10, message: 'Starting try-on...', processing_id: processingId });

      // 2. Parallel image optimization
      const [optimizedPerson, optimizedClothing] = await Promise.all([
        optimizeImage(Buffer.from(person_image, 'base64')),
        optimizeImage(Buffer.from(clothing_image, 'base64')),
      ]);

      // 3. Generate with Gemini — person FIRST
      await send({ step: 'generating', progress: 30, message: 'Generating virtual try-on...' });
      const { image, model, inputTokens, outputTokens } = await generateImageWithGemini(
        AI_PROMPTS.tryOn,
        [optimizedPerson.toString('base64'), optimizedClothing.toString('base64')],
        '2:3'
      );

      // 4. Upload result only — input images are never stored
      await send({ step: 'uploading', progress: 80, message: 'Saving result...' });
      const resultPath = `${customer.id}/${processingId}.webp`;
      const optimizedResult = await optimizeImage(Buffer.from(image, 'base64'));
      await getStorageProvider().uploadFile(resultPath, optimizedResult, 'image/webp');

      // 5. Deduct credits atomically
      const { remainingCredits } = await deductEnterpriseCredits(
        customer.id,
        customer.creditsPerRequest,
        processingId
      );

      // 6. Signed URL + update job
      const signedUrl = await createSignedUrl(resultPath);
      const resultUrlExpiresAt = new Date(Date.now() + 1800 * 1000);
      const perfMetadata = {
        processingTimeMs: Date.now() - startTime,
        modelUsed: model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      };

      await db
        .update(enterpriseProcessingJobs)
        .set({
          status: 'completed',
          resultImagePath: resultPath,
          resultSignedUrl: signedUrl,
          resultUrlExpiresAt,
          creditsDeducted: customer.creditsPerRequest,
          processingCompletedAt: new Date(),
          metadata: perfMetadata,
        })
        .where(eq(enterpriseProcessingJobs.id, processingId));

      await send({
        step: 'completed',
        progress: 100,
        processing_id: processingId,
        result_url: signedUrl,
        result_url_expires_at: resultUrlExpiresAt.toISOString(),
        credits_used: customer.creditsPerRequest,
        credits_remaining: remainingCredits,
        model_used: model,
        processing_time_ms: perfMetadata.processingTimeMs,
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (processingId) {
        await db
          .update(enterpriseProcessingJobs)
          .set({ status: 'failed', errorMessage: message })
          .where(eq(enterpriseProcessingJobs.id, processingId))
          .catch(() => {});
      }

      await send({ step: 'error', error: message, processing_id: processingId });
    }
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 200 });
}
