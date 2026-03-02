import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import {
  enterpriseApiKeys,
  enterpriseCustomers,
  enterpriseRpmCounters,
} from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

// ─── Key Generation ────────────────────────────────────────────────────────

export function generateApiKey(): { fullKey: string; keyHash: string; keyPrefix: string } {
  const random = randomBytes(32).toString('hex');
  const fullKey = `fre_live_${random}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = fullKey.slice(0, 12);
  return { fullKey, keyHash, keyPrefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ─── Key Verification ──────────────────────────────────────────────────────

export interface AuthResult {
  customer: typeof enterpriseCustomers.$inferSelect;
  apiKey: typeof enterpriseApiKeys.$inferSelect;
}

/**
 * Verifies the X-API-Key header.
 * Returns { customer, apiKey } if valid and active, or null if unauthorized.
 */
export async function verifyEnterpriseKey(request: NextRequest): Promise<AuthResult | null> {
  const rawKey = request.headers.get('X-API-Key');
  if (!rawKey) return null;

  const keyHash = hashApiKey(rawKey);

  const result = await db.query.enterpriseApiKeys.findFirst({
    where: eq(enterpriseApiKeys.keyHash, keyHash),
    with: { customer: true },
  });

  if (!result) return null;
  if (!result.isActive) return null;
  if (result.expiresAt && result.expiresAt < new Date()) return null;
  if (!result.customer.isActive) return null;

  // Update lastUsedAt (fire and forget)
  db.update(enterpriseApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(enterpriseApiKeys.id, result.id))
    .catch(() => {});

  return { customer: result.customer, apiKey: result };
}

// ─── RPM Check ─────────────────────────────────────────────────────────────

export async function checkAndIncrementRpm(
  apiKeyId: string,
  rpmLimit: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0); // truncate to current minute

  const [result] = await db
    .insert(enterpriseRpmCounters)
    .values({ apiKeyId, windowStart, requestCount: 1 })
    .onConflictDoUpdate({
      target: [enterpriseRpmCounters.apiKeyId, enterpriseRpmCounters.windowStart],
      set: { requestCount: sql`${enterpriseRpmCounters.requestCount} + 1` },
    })
    .returning({ requestCount: enterpriseRpmCounters.requestCount });

  const allowed = result.requestCount <= rpmLimit;
  const retryAfterSeconds = allowed ? 0 : 60 - new Date().getSeconds();
  return { allowed, retryAfterSeconds };
}
