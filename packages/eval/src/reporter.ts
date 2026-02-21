import type { EvalRun } from '@latcha/core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function saveResults(run: EvalRun, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });

  const dateStr = run.timestamp.split('T')[0];
  const baseName = `${dateStr}_${run.generatorId}`;

  // Save JSON
  const jsonPath = join(outputDir, `${baseName}.json`);
  writeFileSync(jsonPath, JSON.stringify(run, null, 2));

  // Save Markdown table
  const mdPath = join(outputDir, `${baseName}.md`);
  const md = generateMarkdown(run);
  writeFileSync(mdPath, md);

  return jsonPath;
}

export function printResults(run: EvalRun): void {
  console.log(generateMarkdown(run));
}

function generateMarkdown(run: EvalRun): string {
  const lines: string[] = [];
  const dateStr = run.timestamp.split('T')[0];
  lines.push(`## Eval Results: ${run.generatorId} (${dateStr})\n`);
  lines.push('| Model | Accuracy | Avg Latency |');
  lines.push('|-------|----------|-------------|');

  for (const mr of run.modelResults) {
    const correct = mr.challenges.filter((c) => c.correct).length;
    const total = mr.challenges.length;
    const latency = (mr.avgLatencyMs / 1000).toFixed(1);
    lines.push(`| ${mr.modelName} | ${correct}/${total} | ${latency}s |`);
  }

  lines.push('');
  return lines.join('\n');
}
