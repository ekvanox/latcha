import type { Challenge } from '@latcha/core';

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
  // select-all: grid cell selection
  return [
    challenge.question,
    '',
    'The images are arranged in a 3×3 grid, numbered left-to-right, top-to-bottom:',
    '1 2 3',
    '4 5 6',
    '7 8 9',
    '',
    'Respond with ONLY the cell numbers that contain a hidden face, comma-separated (e.g. "1,3,7"). Nothing else.',
  ].join('\n');
}

export function parseAnswer(raw: string, options?: string[]): string {
  const cleaned = raw.trim().toUpperCase();

  // Multiple-choice path: try to extract a letter A-D
  if (options) {
    const letterMatch = cleaned.match(/^([A-D])\b/);
    if (letterMatch) {
      const idx = letterMatch[1]!.charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) {
        return options[idx]!;
      }
    }

    for (const opt of options) {
      if (cleaned.includes(opt.toUpperCase())) {
        return opt;
      }
    }

    return cleaned;
  }

  // select-all path: extract digits 1–9 and return sorted comma-joined
  const digits = cleaned.match(/[1-9]/g);
  if (digits && digits.length > 0) {
    const unique = Array.from(new Set(digits.map(Number)))
      .sort((a, b) => a - b)
      .map(String);
    return unique.join(',');
  }

  return cleaned;
}
