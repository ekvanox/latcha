interface PendingChallenge {
  correctAnswer: string; // e.g. "1,3,7"
  expiresAt: number;
}

const pending = new Map<string, PendingChallenge>();

function prunePending() {
  const now = Date.now();
  for (const [id, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(id);
  }
}

export function storePending(challengeId: string, correctAnswer: string) {
  prunePending();
  pending.set(challengeId, {
    correctAnswer,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

export function consumePending(
  challengeId: string,
): PendingChallenge | undefined {
  const entry = pending.get(challengeId);
  if (!entry) return undefined;
  pending.delete(challengeId);
  return entry.expiresAt > Date.now() ? entry : undefined;
}
