import type { Challenge, ChallengeResponse, VerificationResult } from '@latcha/core';
import { storeChallenge as storeInMemoryChallenge, verify as verifyInMemoryChallenge } from '@latcha/core';
import { createPocketBaseAdminClient, hasPocketBaseAdminConfig } from './pocketbase';

const DEFAULT_CHALLENGE_COLLECTION = 'captcha_challenges';
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

interface StoredChallengeRecord {
  id: string;
  payload?: unknown;
}

function getChallengeCollectionName(): string {
  return (
    process.env.POCKETBASE_CHALLENGES_COLLECTION ?? DEFAULT_CHALLENGE_COLLECTION
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

/**
 * For select-all challenges (array correctAnswer), allow ±1 total error.
 * For multiple-choice (string correctAnswer), use exact match only.
 */
function isAnswerCorrect(
  submitted: string | string[],
  correct: string | string[],
): boolean {
  const normalizedSubmitted = normalizeAnswer(submitted);
  const normalizedCorrect = normalizeAnswer(correct);

  if (normalizedSubmitted === normalizedCorrect) return true;

  // Only apply tolerance for numeric comma-separated select-all answers
  if (!Array.isArray(correct)) return false;

  const correctNums = normalizedCorrect
    .split(',')
    .map((s) => Number(s))
    .filter((n) => !isNaN(n) && n > 0);

  const submittedNums = normalizedSubmitted
    .split(',')
    .map((s) => Number(s))
    .filter((n) => !isNaN(n) && n > 0);

  if (correctNums.length === 0 || submittedNums.length === 0) return false;

  const correctSet = new Set(correctNums);
  const submittedSet = new Set(submittedNums);

  let errors = 0;
  for (const n of correctSet) {
    if (!submittedSet.has(n)) errors++;
  }
  for (const n of submittedSet) {
    if (!correctSet.has(n)) errors++;
  }

  return errors <= 1;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === 404
  );
}

function parseStoredChallenge(value: unknown): StoredChallenge | null {
  if (!value) return null;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as StoredChallenge;
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value as StoredChallenge;
  }

  return null;
}

export async function storeChallenge(challenge: Challenge): Promise<void> {
  if (!hasPocketBaseAdminConfig()) {
    storeInMemoryChallenge(challenge);
    return;
  }

  try {
    const pb = await createPocketBaseAdminClient();
    const collection = getChallengeCollectionName();
    const payload = {
      challenge_id: challenge.id,
      expires_at: new Date(challenge.expiresAt).toISOString(),
      payload: serializeChallenge(challenge),
    };

    let existingRecordId: string | null = null;
    try {
      const existing =
        (await pb
          .collection(collection)
          .getFirstListItem(
            pb.filter('challenge_id = {:challengeId}', {
              challengeId: challenge.id,
            }),
          )) as StoredChallengeRecord;
      existingRecordId = existing.id;
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    if (existingRecordId) {
      await pb.collection(collection).update(existingRecordId, payload);
    } else {
      await pb.collection(collection).create(payload);
    }
  } catch (error) {
    console.warn(
      `PocketBase challenge storage failed, falling back to in-memory store: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );

    storeInMemoryChallenge(challenge);
    memoryBackedChallengeIds.add(challenge.id);
  }
}

export async function verifyChallenge(response: ChallengeResponse): Promise<VerificationResult> {
  if (!hasPocketBaseAdminConfig()) {
    return verifyInMemoryChallenge(response);
  }

  if (memoryBackedChallengeIds.has(response.challengeId)) {
    memoryBackedChallengeIds.delete(response.challengeId);
    return verifyInMemoryChallenge(response);
  }

  try {
    const pb = await createPocketBaseAdminClient();
    const collection = getChallengeCollectionName();

    let record: StoredChallengeRecord;
    try {
      record = (await pb
        .collection(collection)
        .getFirstListItem(
          pb.filter('challenge_id = {:challengeId}', {
            challengeId: response.challengeId,
          }),
        )) as StoredChallengeRecord;
    } catch (error) {
      if (isNotFoundError(error)) {
        return { success: false, challengeId: response.challengeId };
      }

      throw error;
    }

    await pb.collection(collection).delete(record.id);

    const storedChallenge = parseStoredChallenge(record.payload);
    if (!storedChallenge) {
      return { success: false, challengeId: response.challengeId };
    }

    const challenge = deserializeChallenge(storedChallenge);

    if (Date.now() > challenge.expiresAt) {
      return { success: false, challengeId: response.challengeId };
    }

    return {
      success: isAnswerCorrect(response.answer, challenge.correctAnswer),
      challengeId: response.challengeId,
    };
  } catch (error) {
    console.warn(
      `PocketBase challenge verification failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );

    return { success: false, challengeId: response.challengeId };
  }
}