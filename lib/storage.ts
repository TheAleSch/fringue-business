import sharp from 'sharp';

interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Optimize image using Sharp: resize and convert to WebP.
 * Returns a Buffer (not base64) for direct use with Gemini / R2.
 */
export async function optimizeImage(
  input: Buffer,
  options: OptimizeOptions = {}
): Promise<Buffer> {
  const { maxWidth = 1500, maxHeight = 1500, quality = 80 } = options;

  return sharp(input)
    .resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();
}
