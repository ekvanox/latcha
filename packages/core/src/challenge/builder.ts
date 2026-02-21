import type { Challenge } from '../types.js';
import { getGenerator, getAllGenerators } from '../generators/index.js';
import { randomPick } from '../utils/random.js';

/** Build a challenge using a specific generator */
export async function buildChallenge(generatorId: string): Promise<Challenge> {
  const generator = getGenerator(generatorId);
  if (!generator) {
    throw new Error(`Unknown generator: ${generatorId}. Available: ${getAllGenerators().map((g) => g.config.id).join(', ')}`);
  }
  return generator.generate();
}

/** Build a challenge using a random generator */
export async function buildRandomChallenge(): Promise<Challenge> {
  const generators = getAllGenerators();
  const generator = randomPick(generators);
  return generator.generate();
}
