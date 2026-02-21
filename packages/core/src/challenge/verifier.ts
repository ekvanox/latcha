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

  // Compare answers with tolerance for select-all challenges
  return {
    success: isAnswerCorrect(response.answer, challenge.correctAnswer),
    challengeId: response.challengeId,
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
