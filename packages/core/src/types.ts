// A generated CAPTCHA challenge
export interface Challenge {
  id: string;
  generatorId: string;
  images: ChallengeImage[];
  question: string;
  options?: string[];
  correctAnswer: string | string[];
  metadata: Record<string, unknown>;
  expiresAt: number;
}

export interface ChallengeImage {
  data: Buffer;
  mimeType: 'image/png' | 'image/gif' | 'image/webp';
  width: number;
  height: number;
}

// What the user submits
export interface ChallengeResponse {
  challengeId: string;
  answer: string | string[];
}

// Verification result
export interface VerificationResult {
  success: boolean;
  challengeId: string;
}

// ---- Generator interface ----

export type ChallengeFormat =
  | 'multiple-choice'
  | 'select-all'
  | 'select-one-image';

export interface GeneratorConfig {
  id: string;
  name: string;
  description: string;
  format: ChallengeFormat;
  difficulty: 'easy' | 'medium' | 'hard';
}

export abstract class CaptchaGenerator {
  abstract config: GeneratorConfig;
  abstract generate(): Promise<Challenge>;
}

// ---- Eval types ----

export interface EvalRun {
  runId: string;
  timestamp: string;
  generatorId: string;
  modelResults: ModelResult[];
}

export interface ModelResult {
  modelId: string;
  modelName: string;
  challenges: EvalChallengeResult[];
  accuracy: number;
  avgLatencyMs: number;
}

export interface EvalChallengeResult {
  challengeId: string;
  modelAnswer: string | string[];
  correctAnswer: string | string[];
  correct: boolean;
  latencyMs: number;
  rawResponse: string;
}
