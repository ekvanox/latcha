// Types
export type {
  Challenge,
  ChallengeImage,
  ChallengeResponse,
  VerificationResult,
  ChallengeFormat,
  GeneratorConfig,
  EvalRun,
  ModelResult,
  EvalChallengeResult,
} from './types.js';
export { CaptchaGenerator } from './types.js';

// Generators
export { getGenerator, getAllGenerators, getGeneratorIds } from './generators/index.js';
export { GridOverlayGenerator } from './generators/grid-overlay.js';
export { ProximityTextGenerator } from './generators/proximity-text.js';
export { PartialOcclusionGenerator } from './generators/partial-occlusion.js';

// Challenge
export { buildChallenge, buildRandomChallenge } from './challenge/builder.js';
export { storeChallenge, verify, pruneExpired } from './challenge/verifier.js';

// Utils
export { generateId } from './utils/random.js';
