import crypto from 'node:crypto';

/** Crypto-safe random integer in [min, max) */
export function randomInt(min: number, max: number): number {
  const range = max - min;
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return min + (bytes[0] % range);
}

/** Pick a random element from an array */
export function randomPick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length)];
}

/** Shuffle an array in place (Fisher-Yates) */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Generate a crypto-random UUID */
export function generateId(): string {
  return crypto.randomUUID();
}
