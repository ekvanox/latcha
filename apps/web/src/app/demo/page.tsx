"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TestProgressBar } from "./components/TestProgressBar";
import { CaptchaQuestion } from "./components/CaptchaQuestion";
import { ResultsScreen } from "./components/ResultsScreen";
import type { CaptchaItem, UserAnswer, TestState } from "./types";
import { shuffle } from "./types";

export default function DemoPage() {
  const [state, setState] = useState<TestState>("idle");
  const [items, setItems] = useState<CaptchaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const answersRef = useRef<Record<string, UserAnswer>>({});

  const startTest = useCallback(async () => {
    setState("loading");
    setError(null);
    answersRef.current = {};
    setCurrentIndex(0);

    try {
      const res = await fetch("/api/captcha-test");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load challenges");
      }

      const data = await res.json();
      const shuffled = shuffle(data.items as CaptchaItem[]);

      if (shuffled.length === 0) {
        throw new Error("No captcha challenges found. Generate some first.");
      }

      setItems(shuffled);
      setState("testing");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load challenges",
      );
      setState("idle");
    }
  }, []);

  const handleAnswer = useCallback(
    (answer: UserAnswer) => {
      const currentItem = items[currentIndex];
      if (!currentItem) return;

      answersRef.current[currentItem.challengeId] = answer;

      const nextIndex = currentIndex + 1;
      if (nextIndex >= items.length) {
        setState("completed");
      } else {
        setCurrentIndex(nextIndex);
      }
    },
    [items, currentIndex],
  );

  const answeredCount = Object.keys(answersRef.current).length;

  return (
    <div className="min-h-screen font-[family-name:var(--font-geist-sans)]">
      {state === "testing" && (
        <TestProgressBar current={answeredCount} total={items.length} />
      )}

      <div
        className={`max-w-2xl mx-auto px-4 py-8 ${state === "testing" ? "pt-20" : ""}`}
      >
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            &larr; Back
          </Link>
          <h1 className="text-lg sm:text-xl font-bold">Lacha</h1>
          <div className="w-12" />
        </div>

        {state === "idle" && (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-xl sm:text-2xl">
                Captcha Test
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Test your perception against all saved captcha challenges. Each
                challenge is shown exactly once in a random order.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}
              <Button onClick={startTest} className="w-full" size="lg">
                Start Captcha Test
              </Button>
            </CardContent>
          </Card>
        )}

        {state === "loading" && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-foreground rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Loading challenges...</p>
          </div>
        )}

        {state === "testing" && items[currentIndex] && (
          <CaptchaQuestion
            key={items[currentIndex].challengeId}
            item={items[currentIndex]}
            onAnswer={handleAnswer}
          />
        )}

        {state === "completed" && (
          <ResultsScreen items={items} answers={answersRef.current} />
        )}
      </div>
    </div>
  );
}
