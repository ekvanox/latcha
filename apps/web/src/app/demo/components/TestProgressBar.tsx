"use client";

import { Progress } from "@/components/ui/progress";

interface TestProgressBarProps {
  current: number;
  total: number;
}

export function TestProgressBar({ current, total }: TestProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-cream/90 backdrop-blur-sm border-b border-card-border">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-text-secondary">
            Progress
          </span>
          <span className="text-xs font-mono text-text-secondary">
            {current} / {total} ({percentage}%)
          </span>
        </div>
        <Progress value={percentage} className="h-1.5" />
      </div>
    </div>
  );
}
