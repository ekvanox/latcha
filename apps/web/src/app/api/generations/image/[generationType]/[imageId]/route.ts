import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { resolveGenerationImageFile } from '../../../../../../lib/generations';

interface RouteContext {
  params: Promise<{ generationType: string; imageId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { generationType, imageId } = await context.params;

  try {
    const { filePath, mimeType } = resolveGenerationImageFile(generationType, imageId);
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
