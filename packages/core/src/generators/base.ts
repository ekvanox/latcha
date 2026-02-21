import type { Challenge, GeneratorConfig } from '../types.js';
import { generateId } from '../utils/random.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export abstract class BaseGenerator {
  abstract config: GeneratorConfig;

  abstract generate(): Promise<Challenge>;

  /** Helper to create a challenge shell with ID and expiry */
  protected createChallengeShell(): Pick<Challenge, 'id' | 'expiresAt' | 'generatorId'> {
    return {
      id: generateId(),
      generatorId: this.config.id,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    };
  }
}
