import { getGeneratorIds } from '@latcha/core';
import { runEval, runEvalOnChallenges } from './runner.js';
import { saveResults, printResults } from './reporter.js';
import { resolve } from 'node:path';
import { loadEvalEnv } from './env.js';
import { loadGenerationChallenges, loadGenerationTypes } from './generations';

loadEvalEnv();

const args = process.argv.slice(2);

interface CliArgs {
  generator?: string;
  all: boolean;
  count?: number;
  fromGenerations: boolean;
  generationsDir?: string;
}

function parseArgs(args: string[]): CliArgs {
  let generator: string | undefined;
  let all = false;
  let count: number | undefined;
  let fromGenerations = false;
  let generationsDir: string | undefined;

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
      case '--from-generations':
        fromGenerations = true;
        break;
      case '--generations-dir':
        generationsDir = args[++i];
        break;
    }
  }
  return { generator, all, count, fromGenerations, generationsDir };
}

async function main() {
  const { generator, all, count, fromGenerations, generationsDir } = parseArgs(args);
  const outputDir = resolve(import.meta.dirname, '../../results');
  const evalCount = count ?? 20;

  if (fromGenerations) {
    if (all) {
      const generationTypes = await loadGenerationTypes(generationsDir);

      if (!generationTypes.length) {
        throw new Error('No pre-generated generation types found.');
      }

      for (const generationType of generationTypes) {
        const challenges = await loadGenerationChallenges({
          generationsDir,
          generationType,
          limit: evalCount,
        });

        console.log(`Loaded ${challenges.length} challenge(s) from ${generationType}.`);

        const run = await runEvalOnChallenges({
          generatorId: generationType,
          challenges,
        });

        printResults(run);
        const path = saveResults(run, outputDir);
        console.log(`Saved to ${path}\n`);
      }

      return;
    }

    const generationType = generator;
    if (!generationType) {
      console.error('Usage for pre-generated eval: pnpm eval --from-generations --generator <id> [--count N]');
      console.error('                           or: pnpm eval --from-generations --all [--count N]');
      process.exit(1);
    }

    const challenges = await loadGenerationChallenges({
      generationsDir,
      generationType,
      limit: evalCount,
    });

    console.log(`Loaded ${challenges.length} challenge(s) from ${generationType}.`);

    const run = await runEvalOnChallenges({
      generatorId: generationType,
      challenges,
    });

    printResults(run);
    const path = saveResults(run, outputDir);
    console.log(`Saved to ${path}\n`);
    return;
  }

  const generatorIds = all ? getGeneratorIds() : generator ? [generator] : undefined;

  if (!generatorIds) {
    console.error('Usage: pnpm eval --generator <id> [--count N]');
    console.error('       pnpm eval --all [--count N]');
    console.error('       pnpm eval --from-generations --generator <id> [--count N] [--generations-dir <path>]');
    console.error('       pnpm eval --from-generations --all [--count N] [--generations-dir <path>]');
    console.error(`\nAvailable live generators: ${getGeneratorIds().join(', ')}`);
    process.exit(1);
  }

  for (const gid of generatorIds) {
    const run = await runEval({ generatorId: gid, count: evalCount });
    printResults(run);
    const path = saveResults(run, outputDir);
    console.log(`Saved to ${path}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
