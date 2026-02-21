import {
  buildChallenge,
  buildRandomChallenge,
  getGeneratorIds,
  type Challenge,
} from '@lacha/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadEvalEnv } from './env.js';

loadEvalEnv();

interface ManualArgs {
  generator?: string;
  all: boolean;
  count: number;
}

function parseArgs(args: string[]): ManualArgs {
  let generator: string | undefined;
  let all = false;
  let count = 3;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--generator':
      case '-g':
        generator = args[++i];
        break;
      case '--all':
      case '-a':
        all = true;
        break;
      case '--count':
      case '-n':
        count = parseInt(args[++i], 10);
        break;
    }
  }

  if (!Number.isFinite(count) || count < 1) {
    throw new Error('Invalid --count. Please provide a number >= 1.');
  }

  return { generator, all, count };
}

function usage(): void {
  console.log('Manual challenge mode (no AI involved)');
  console.log('Usage:');
  console.log('  pnpm manual                 # random generator, 3 challenges');
  console.log('  pnpm manual --generator <id> [--count N]');
  console.log('  pnpm manual --all [--count N]');
  console.log(`\nAvailable generators: ${getGeneratorIds().join(', ')}`);
}

function normalizeAnswer(answer: string | string[]): string {
  if (Array.isArray(answer)) {
    return answer.map((entry) => entry.trim().toUpperCase()).sort().join(',');
  }

  return answer.trim().toUpperCase();
}

function parseManualInput(raw: string, challenge: Challenge): string | string[] {
  const inputValue = raw.trim();

  if (challenge.options) {
    const letter = inputValue.toUpperCase();
    if (letter.length === 1 && letter >= 'A' && letter <= 'Z') {
      const index = letter.charCodeAt(0) - 65;
      if (index >= 0 && index < challenge.options.length) {
        return challenge.options[index];
      }
    }
    return inputValue;
  }

  if (inputValue.includes(',')) {
    return inputValue
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return inputValue;
}

function fileExtensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}

function saveChallengeImages(baseDir: string, challenge: Challenge, index: number): string {
  const challengeDir = join(baseDir, `${String(index + 1).padStart(2, '0')}-${challenge.generatorId}-${challenge.id}`);
  mkdirSync(challengeDir, { recursive: true });

  challenge.images.forEach((img, imageIndex) => {
    const ext = fileExtensionForMimeType(img.mimeType);
    const imagePath = join(challengeDir, `image-${imageIndex + 1}.${ext}`);
    writeFileSync(imagePath, img.data);
  });

  const metadataPath = join(challengeDir, 'challenge.json');
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        challengeId: challenge.id,
        generatorId: challenge.generatorId,
        question: challenge.question,
        options: challenge.options,
      },
      null,
      2,
    ),
  );

  return challengeDir;
}

async function askUserToSolve(
  rl: ReturnType<typeof createInterface>,
  challenge: Challenge,
  challengeDir: string,
): Promise<{ quit: boolean; correct: boolean }> {
  console.log(`\nChallenge: ${challenge.id}`);
  console.log(`Generator: ${challenge.generatorId}`);
  console.log(`Images saved to: ${challengeDir}`);
  console.log(`Question: ${challenge.question}`);

  if (challenge.options) {
    challenge.options.forEach((option, i) => {
      const letter = String.fromCharCode(65 + i);
      console.log(`  ${letter}) ${option}`);
    });
  }

  const prompt = challenge.options
    ? 'Your answer (letter or full option, q to quit): '
    : 'Your answer (text or comma-separated list, q to quit): ';

  let raw = '';
  try {
    raw = await rl.question(prompt);
  } catch {
    return { quit: true, correct: false };
  }

  if (raw.trim().toLowerCase() === 'q') {
    return { quit: true, correct: false };
  }

  const submitted = parseManualInput(raw, challenge);
  const correct =
    normalizeAnswer(submitted) === normalizeAnswer(challenge.correctAnswer);

  if (correct) {
    console.log('✅ Correct');
  } else {
    console.log(`❌ Incorrect. Correct answer: ${Array.isArray(challenge.correctAnswer) ? challenge.correctAnswer.join(', ') : challenge.correctAnswer}`);
  }

  return { quit: false, correct };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { generator, all, count } = parseArgs(args);
  const available = getGeneratorIds();

  if (generator && !available.includes(generator)) {
    usage();
    throw new Error(`Unknown generator: ${generator}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolve(import.meta.dirname, `../../../results/manual/${timestamp}`);
  mkdirSync(outDir, { recursive: true });

  const rl = createInterface({ input, output });
  let total = 0;
  let correct = 0;
  let quit = false;

  const generatorIds = all ? available : generator ? [generator] : [undefined];

  try {
    for (const gid of generatorIds) {
      for (let i = 0; i < count; i++) {
        const challenge = gid
          ? await buildChallenge(gid)
          : await buildRandomChallenge();

        const challengeDir = saveChallengeImages(outDir, challenge, total);
        const result = await askUserToSolve(rl, challenge, challengeDir);

        if (result.quit) {
          quit = true;
          break;
        }

        total += 1;
        if (result.correct) {
          correct += 1;
        }
      }

      if (quit) {
        break;
      }
    }
  } finally {
    rl.close();
  }

  console.log('\n--- Manual solve summary ---');
  console.log(`Solved: ${total}`);
  console.log(`Correct: ${correct}`);
  console.log(`Accuracy: ${total > 0 ? Math.round((correct / total) * 100) : 0}%`);
  console.log(`Saved challenges: ${outDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  usage();
  process.exit(1);
});