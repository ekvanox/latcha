import { NextRequest, NextResponse } from 'next/server';
import { listGenerationVisualizations } from '../../../lib/generations';

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  const generationType = request.nextUrl.searchParams.get('generationType') ?? undefined;
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : 50;
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 50;

  try {
    const items = await listGenerationVisualizations(limit, generationType);
    const withUrls = items.map((item) => ({
      ...item,
      outputImageUrl: `/api/generations/image/${item.generationType}/${item.imageUuid}`,
      controlImageUrl: item.controlImageUuid
        ? `/api/generations/image/${item.generationType}/${item.controlImageUuid}`
        : null,
    }));

    return NextResponse.json({ items: withUrls, count: withUrls.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
