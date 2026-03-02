import { NextRequest, NextResponse } from 'next/server';
import { partnerApiSpec, adminApiSpec } from '@/lib/openapi';

const specs: Record<string, object> = {
  partner: partnerApiSpec,
  admin: adminApiSpec,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ spec: string }> }
) {
  const { spec } = await params;
  const data = specs[spec];

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="fringue-${spec}-api.json"`,
    },
  });
}
