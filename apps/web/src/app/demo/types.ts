export interface CaptchaItem {
  challengeId: string;
  imageUuid: string;
  generationType: string;
  question: string;
  answerAlternatives: string[];
  correctAlternative: string;
  imageUrl: string;
  // select-all (grid) challenges supply all 9 cell images as base64 data-URLs
  format?: 'multiple-choice' | 'select-all';
  gridImageUrls?: string[];
}

export interface UserAnswer {
  answer: string | string[];
  responseTimeMs: number;
}

export type TestState = "idle" | "loading" | "testing" | "completed";

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = tmp as T;
  }
  return copy;
}

export const SKIP_ANSWER = "__skip__";

export interface CategoryStats {
  generationType: string;
  total: number;
  correct: number;
  skipped: number;
  percentage: number;
  avgResponseTimeMs: number;
}
