import { NextRequest, NextResponse } from 'next/server';

/**
 * Validates the X-Admin-Secret header against the ADMIN_API_SECRET env var.
 * Returns a 401 response if unauthorized, or null if authorized.
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const secret = request.headers.get('X-Admin-Secret');
  if (!secret || secret !== process.env.ADMIN_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
