import { getGeneratorIds } from '@latcha/core';
import { runEval } from './runner.js';
import { saveResults, printResults } from './reporter.js';
import { resolve } from 'node:path';
import { loadEvalEnv } from './env.js';

loadEvalEnv();

const args = process.argv.slice(2);

interface CliArgs {
  generator?: string;
  all: boolean;
  count?: number;
}

function parseArgs(args: string[]): CliArgs {
  let generator: string | undefined;
  let all = false;
  let count: number | undefined;

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
  return { generator, all, count };
}

async function main() {
  const { generator, all, count } = parseArgs(args);
  const outputDir = resolve(import.meta.dirname, '../../results');
  const evalCount = count ?? 20;

  const generatorIds = all ? getGeneratorIds() : generator ? [generator] : undefined;

  if (!generatorIds) {
    console.error('Usage: pnpm eval --generator <id> [--count N]');
    console.error('       pnpm eval --all [--count N]');
    console.error(`\nAvailable generators: ${getGeneratorIds().join(', ')}`);
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
