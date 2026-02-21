import type { Challenge, ChallengeResponse, VerificationResult } from '@lacha/core';
import { storeChallenge as storeInMemoryChallenge, verify as verifyInMemoryChallenge } from '@lacha/core';
import { createSupabaseServerClient } from './supabase';

const DEFAULT_CHALLENGE_TABLE = 'captcha_challenges';
const memoryBackedChallengeIds = new Set<string>();

interface StoredImage {
  data: string;
  mimeType: Challenge['images'][number]['mimeType'];
  width: number;
  height: number;
}

interface StoredChallenge extends Omit<Challenge, 'images'> {
  images: StoredImage[];
}

function getChallengeTableName(): string {
  return process.env.SUPABASE_CHALLENGES_TABLE ?? DEFAULT_CHALLENGE_TABLE;
}

function hasSupabaseServerConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function serializeChallenge(challenge: Challenge): StoredChallenge {
  return {
    ...challenge,
    images: challenge.images.map((img) => ({
      data: img.data.toString('base64'),
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
    })),
  };
}

function deserializeChallenge(challenge: StoredChallenge): Challenge {
  return {
    ...challenge,
    images: challenge.images.map((img) => ({
      data: Buffer.from(img.data, 'base64'),
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
    })),
  };
}

function normalizeAnswer(answer: string | string[]): string {
  if (Array.isArray(answer)) {
    return answer.map((a) => a.trim().toUpperCase()).sort().join(',');
  }

  return answer.trim().toUpperCase();
}

export async function storeChallenge(challenge: Challenge): Promise<void> {
  if (!hasSupabaseServerConfig()) {
    storeInMemoryChallenge(challenge);
    return;
  }

  try {
    const supabase = createSupabaseServerClient();
    const table = getChallengeTableName();

    const { error } = await supabase
      .from(table)
      .upsert({
        id: challenge.id,
        expires_at: new Date(challenge.expiresAt).toISOString(),
        payload: serializeChallenge(challenge),
      });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.warn(
      `Supabase challenge storage failed, falling back to in-memory store: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );

    storeInMemoryChallenge(challenge);
    memoryBackedChallengeIds.add(challenge.id);
  }
}

export async function verifyChallenge(response: ChallengeResponse): Promise<VerificationResult> {
  if (!hasSupabaseServerConfig()) {
    return verifyInMemoryChallenge(response);
  }

  if (memoryBackedChallengeIds.has(response.challengeId)) {
    memoryBackedChallengeIds.delete(response.challengeId);
    return verifyInMemoryChallenge(response);
  }

  try {
    const supabase = createSupabaseServerClient();
    const table = getChallengeTableName();

    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq('id', response.challengeId)
      .select('payload')
      .maybeSingle();

    if (error || !data) {
      return { success: false, challengeId: response.challengeId };
    }

    const storedChallenge = (data as { payload: StoredChallenge }).payload;
    const challenge = deserializeChallenge(storedChallenge);

    if (Date.now() > challenge.expiresAt) {
      return { success: false, challengeId: response.challengeId };
    }

    return {
      success:
        normalizeAnswer(challenge.correctAnswer) === normalizeAnswer(response.answer),
      challengeId: response.challengeId,
    };
  } catch (error) {
    console.warn(
      `Supabase challenge verification failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );

    return { success: false, challengeId: response.challengeId };
  }
}