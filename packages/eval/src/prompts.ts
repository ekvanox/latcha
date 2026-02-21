import type { Challenge } from '@lacha/core';

export function buildEvalPrompt(challenge: Challenge): string {
  if (challenge.options) {
    return [
      challenge.question,
      '',
      ...challenge.options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`),
      '',
      'Respond with ONLY the letter of your answer (A, B, C, or D). Nothing else.',
    ].join('\n');
  }
  return (
    challenge.question +
    '\n\nRespond with ONLY the numbers of the matching images, comma-separated.'
  );
}

export function parseAnswer(raw: string, options?: string[]): string {
  const cleaned = raw.trim().toUpperCase();

  // Try to extract just a letter A-D
  const letterMatch = cleaned.match(/^([A-D])\b/);
  if (letterMatch && options) {
    const idx = letterMatch[1].charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      return options[idx];
    }
  }

  // If the response contains one of the options directly, use that
  if (options) {
    for (const opt of options) {
      if (cleaned.includes(opt.toUpperCase())) {
        return opt;
      }
    }
  }

  return cleaned;
}
