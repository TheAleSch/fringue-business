/**
 * Storage Provider — Enterprise (single R2 bucket: tryon-enterprise)
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Default signed URL expiry: 30 minutes */
const DEFAULT_SIGNED_URL_EXPIRY = 1800;

// ============================================================================
// INTERFACE
// ============================================================================

export interface StorageProvider {
  uploadFile(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

// ============================================================================
// R2 IMPLEMENTATION
// ============================================================================

class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing R2 environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }

    this.bucket = process.env.R2_BUCKET_TRYON || 'tryon-enterprise';

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async uploadFile(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
  }

  async getSignedUrl(key: string, expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY): Promise<string> {
    return s3GetSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }), { expiresIn });
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!provider) {
    provider = new R2StorageProvider();
  }
  return provider;
}

/**
 * Generate a signed URL for a key in the enterprise R2 bucket.
 * @param key - File key (e.g., "{customerId}/{jobId}.webp")
 * @param expiresIn - Expiry in seconds (default: 1800)
 */
export async function createSignedUrl(
  key: string,
  expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY
): Promise<string> {
  return getStorageProvider().getSignedUrl(key, expiresIn);
}
