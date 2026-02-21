import type { Challenge, ChallengeResponse, VerificationResult } from '../types.js';

/** In-memory challenge store */
const store = new Map<string, Challenge>();

export function storeChallenge(challenge: Challenge): void {
  store.set(challenge.id, challenge);
}

export function verify(response: ChallengeResponse): VerificationResult {
  const challenge = store.get(response.challengeId);

  if (!challenge) {
    return { success: false, challengeId: response.challengeId };
  }

  // Remove challenge (single use)
  store.delete(response.challengeId);

  // Check expiry
  if (Date.now() > challenge.expiresAt) {
    return { success: false, challengeId: response.challengeId };
  }

  // Compare answers
  const correct = normalizeAnswer(challenge.correctAnswer);
  const submitted = normalizeAnswer(response.answer);

  return {
    success: correct === submitted,
    challengeId: response.challengeId,
  };
}

function normalizeAnswer(answer: string | string[]): string {
  if (Array.isArray(answer)) {
    return answer.map((a) => a.trim().toUpperCase()).sort().join(',');
  }
  return answer.trim().toUpperCase();
}

/** Clean up expired challenges */
export function pruneExpired(): number {
  const now = Date.now();
  let pruned = 0;
  for (const [id, challenge] of store) {
    if (now > challenge.expiresAt) {
      store.delete(id);
      pruned++;
    }
  }
  return pruned;
}
