"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CaptchaItem, UserAnswer, CategoryStats } from "../types";
import { SKIP_ANSWER } from "../types";

interface ResultsScreenProps {
  items: CaptchaItem[];
  answers: Record<string, UserAnswer>;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatGenerationType(type: string): string {
  return type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function computeCategoryStats(
  items: CaptchaItem[],
  answers: Record<string, UserAnswer>,
): CategoryStats[] {
  const grouped = new Map<
    string,
    {
      total: number;
      correct: number;
      skipped: number;
      totalTimeMs: number;
      answeredCount: number;
    }
  >();

  for (const item of items) {
    const entry = grouped.get(item.generationType) ?? {
      total: 0,
      correct: 0,
      skipped: 0,
      totalTimeMs: 0,
      answeredCount: 0,
    };
    entry.total += 1;

    const userAnswer = answers[item.challengeId];
    if (userAnswer) {
      entry.totalTimeMs += userAnswer.responseTimeMs;
      entry.answeredCount += 1;

      if (userAnswer.answer === SKIP_ANSWER) {
        entry.skipped += 1;
      } else if (userAnswer.answer === item.correctAlternative) {
        entry.correct += 1;
      }
    }

    grouped.set(item.generationType, entry);
  }

  const stats: CategoryStats[] = [];
  for (const [generationType, entry] of grouped) {
    const nonSkipped = entry.total - entry.skipped;
    stats.push({
      generationType,
      total: entry.total,
      correct: entry.correct,
      skipped: entry.skipped,
      percentage:
        nonSkipped > 0 ? Math.round((entry.correct / nonSkipped) * 100) : 0,
      avgResponseTimeMs:
        entry.answeredCount > 0 ? entry.totalTimeMs / entry.answeredCount : 0,
    });
  }

  return stats.sort((a, b) => a.generationType.localeCompare(b.generationType));
}

export function ResultsScreen({ items, answers }: ResultsScreenProps) {
  const stats = useMemo(
    () => computeCategoryStats(items, answers),
    [items, answers],
  );

  const overallCorrect = stats.reduce((sum, s) => sum + s.correct, 0);
  const overallTotal = items.length;
  const overallSkipped = stats.reduce((sum, s) => sum + s.skipped, 0);
  const overallNonSkipped = overallTotal - overallSkipped;
  const overallPercentage =
    overallNonSkipped > 0
      ? Math.round((overallCorrect / overallNonSkipped) * 100)
      : 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl text-center">
            Test Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-1">
            <p className="text-3xl sm:text-4xl font-bold tabular-nums">
              {overallCorrect} / {overallNonSkipped}
            </p>
            <p className="text-lg text-gray-500 dark:text-gray-400">
              {overallPercentage}% correct
              {overallSkipped > 0 && (
                <span className="text-sm ml-1">({overallSkipped} skipped)</span>
              )}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">
                    Category
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400">
                    Score
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400">
                    %
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    Skipped
                  </th>
                  <th className="text-right py-2 pl-2 font-medium text-gray-500 dark:text-gray-400">
                    Avg Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat) => (
                  <tr
                    key={stat.generationType}
                    className="border-b border-gray-100 dark:border-gray-800/50 last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-medium">
                      {formatGenerationType(stat.generationType)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {stat.correct}/{stat.total - stat.skipped}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-medium">
                      <span
                        className={
                          stat.percentage >= 80
                            ? "text-green-600 dark:text-green-400"
                            : stat.percentage >= 50
                              ? "text-yellow-600 dark:text-yellow-400"
                              : "text-red-600 dark:text-red-400"
                        }
                      >
                        {stat.percentage}%
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-gray-400 hidden sm:table-cell">
                      {stat.skipped}
                    </td>
                    <td className="py-2.5 pl-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {formatTime(stat.avgResponseTimeMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-4">
        Results saved. Run again to compare.
      </p>
    </div>
  );
}
