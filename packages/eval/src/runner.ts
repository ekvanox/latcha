import {
  buildChallenge,
  type Challenge,
  type EvalRun,
  type ModelResult,
  type EvalChallengeResult,
} from '@lacha/core';
import { EVAL_MODELS, type ModelConfig } from './models.js';
import { evaluateWithModel } from './openrouter.js';
import { buildEvalPrompt, parseAnswer } from './prompts.js';
import { generateId } from '@lacha/core';

/**
 * Tolerance scoring for select-all challenges (±1 total error).
 * For multiple-choice (single string answers) falls back to exact match.
 */
function isCorrectWithTolerance(
  parsed: string,
  correctAnswer: string | string[],
): boolean {
  const correctStr = Array.isArray(correctAnswer)
    ? correctAnswer.join(',')
    : correctAnswer;

  // Exact match always passes
  if (parsed.toUpperCase() === correctStr.toUpperCase()) return true;

  // For comma-separated numeric answers (select-all), apply ±1 tolerance
  const correctNums = correctStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n));

  const parsedNums = parsed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n));

  if (correctNums.length === 0 || parsedNums.length === 0) return false;

  const correctSet = new Set(correctNums);
  const parsedSet = new Set(parsedNums);

  let errors = 0;
  for (const n of correctSet) {
    if (!parsedSet.has(n)) errors++; // missed
  }
  for (const n of parsedSet) {
    if (!correctSet.has(n)) errors++; // extra
  }

  return errors <= 1;
}

export interface RunOptions {
  generatorId: string;
  count: number;
  models?: ModelConfig[];
}

export interface RunPreloadedOptions {
  generatorId: string;
  challenges: Challenge[];
  models?: ModelConfig[];
}

export async function runEval(options: RunOptions): Promise<EvalRun> {
  const { generatorId, count, models = EVAL_MODELS } = options;

  console.log(`Generating ${count} challenges with ${generatorId}...`);
  const challenges: Challenge[] = [];
  for (let i = 0; i < count; i++) {
    challenges.push(await buildChallenge(generatorId));
  }
  console.log(`Generated ${challenges.length} challenges.`);

  return runEvalOnChallenges({
    generatorId,
    challenges,
    models,
  });
}

export async function runEvalOnChallenges(options: RunPreloadedOptions): Promise<EvalRun> {
  const { generatorId, challenges, models = EVAL_MODELS } = options;
  const totalChallenges = challenges.length;

  if (totalChallenges === 0) {
    throw new Error('No challenges to evaluate.');
  }

  console.log(`Evaluating ${models.length} models across ${totalChallenges} challenges...\n`);
  const modelResults: ModelResult[] = [];

  for (const model of models) {
    console.log(`  Testing ${model.name}...`);
    const results: EvalChallengeResult[] = [];

    for (let i = 0; i < totalChallenges; i++) {
      const challenge = challenges[i];
      const prompt = buildEvalPrompt(challenge);
      const images = challenge.images.map((img) => ({
        base64: img.data.toString('base64'),
        mimeType: img.mimeType,
      }));

      try {
        const { answer, latencyMs, raw } = await evaluateWithModel(model.id, images, prompt);
        const parsed = parseAnswer(answer, challenge.options);
        const correct = isCorrectWithTolerance(parsed, challenge.correctAnswer);

        results.push({
          challengeId: challenge.id,
          modelAnswer: parsed,
          correctAnswer: challenge.correctAnswer,
          correct,
          latencyMs,
          rawResponse: raw,
        });

        process.stdout.write(correct ? '✓' : '✗');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          challengeId: challenge.id,
          modelAnswer: `ERROR: ${msg}`,
          correctAnswer: challenge.correctAnswer,
          correct: false,
          latencyMs: 0,
          rawResponse: msg,
        });
        process.stdout.write('E');
      }
    }

    const correctCount = results.filter((r) => r.correct).length;
    const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / results.length;

    console.log(`  ${correctCount}/${totalChallenges} correct (${Math.round(avgLatency)}ms avg)\n`);

    modelResults.push({
      modelId: model.id,
      modelName: model.name,
      challenges: results,
      accuracy: correctCount / totalChallenges,
      avgLatencyMs: avgLatency,
    });
  }

  return {
    runId: generateId(),
    timestamp: new Date().toISOString(),
    generatorId,
    modelResults,
  };
}
