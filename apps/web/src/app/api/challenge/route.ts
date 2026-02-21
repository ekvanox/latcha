import { NextRequest, NextResponse } from 'next/server';
import {
  buildChallenge,
  buildRandomChallenge,
  getGeneratorIds,
  type Challenge,
  type ChallengeResponse,
} from '@lacha/core';
import { storeChallenge, verifyChallenge } from '../../../lib/challenge-store';
import { buildGenerationChallenge } from '../../../lib/generations';

// Serialize a challenge for the client (strip correct answer, encode images as base64)
function serializeChallenge(challenge: Challenge) {
  return {
    challengeId: challenge.id,
    generatorId: challenge.generatorId,
    images: challenge.images.map((img) => ({
      data: img.data.toString('base64'),
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
    })),
    question: challenge.question,
    options: challenge.options,
    format: challenge.metadata.format ?? 'multiple-choice',
  };
}

export async function GET(request: NextRequest) {
  const generator = request.nextUrl.searchParams.get('generator');
  const source = request.nextUrl.searchParams.get('source');
  const challengeId = request.nextUrl.searchParams.get('challengeId');

  try {
    const challenge =
      source === 'generations'
        ? await buildGenerationChallenge({
            generationType: generator ?? undefined,
            challengeId: challengeId ?? undefined,
          })
        : generator
          ? await buildChallenge(generator)
          : await buildRandomChallenge();

    await storeChallenge(challenge);

    return NextResponse.json(serializeChallenge(challenge));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      {
        error: msg,
        availableGenerators: getGeneratorIds(),
        availableSources: ['live', 'generations'],
      },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { challengeId, answer } = body;

  if (!challengeId || answer === undefined) {
    return NextResponse.json(
      { error: 'Missing challengeId or answer' },
      { status: 400 },
    );
  }

  const isValidAnswer =
    typeof answer === 'string' ||
    (Array.isArray(answer) && answer.every((entry) => typeof entry === 'string'));

  if (!isValidAnswer) {
    return NextResponse.json(
      { error: 'Invalid answer format. Must be a string or string array.' },
      { status: 400 },
    );
  }

  const result = await verifyChallenge({
    challengeId,
    answer,
  } as ChallengeResponse);

  return NextResponse.json(result);
}
