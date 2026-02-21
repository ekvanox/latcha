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
    async (answer: UserAnswer) => {
      const currentItem = items[currentIndex];
      if (!currentItem) return;

      answersRef.current[currentItem.challengeId] = answer;

      const nextIndex = currentIndex + 1;
      if (nextIndex >= items.length) {
        setState("loading"); // reuse loading state for submission

        try {
          const results = items.map((item) => {
            const a = answersRef.current[item.challengeId];
            return {
              captchaId: item.challengeId,
              answerTimeMs: a.responseTimeMs,
              response: a.answer,
              isCorrect: a.answer === item.correctAlternative,
            };
          });

          // calculate total session time as the sum of all response times
          const totalSessionTimeMs = results.reduce(
            (acc, curr) => acc + curr.answerTimeMs,
            0,
          );

          await fetch("/api/captcha-test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session: {
                userAgent: window.navigator.userAgent,
                deviceType: /Mobi|Android/i.test(window.navigator.userAgent)
                  ? "mobile"
                  : "desktop",
                totalSessionTimeMs,
              },
              results,
            }),
          });
        } catch (err) {
          console.error("Failed to submit results", err);
        }

        setState("completed");
      } else {
        setCurrentIndex(nextIndex);
      }
    },
    [items, currentIndex],
  );

  const answeredCount = Object.keys(answersRef.current).length;

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      {state === "testing" && (
        <TestProgressBar current={answeredCount} total={items.length} />
      )}

      <div
        className={`max-w-2xl mx-auto px-6 py-8 ${state === "testing" ? "pt-20" : ""}`}
      >
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--olive)] transition-colors"
          >
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-lg">🍃</span>
            <h1 className="text-base font-semibold text-[var(--foreground)]">
              lacha
            </h1>
          </div>
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
              <button
                onClick={startTest}
                className="w-full py-3 rounded-full bg-[var(--olive)] text-white font-semibold text-sm hover:bg-[var(--olive-light)] transition-colors"
              >
                Start Captcha Test
              </button>
            </CardContent>
          </Card>
        )}

        {state === "loading" && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-8 h-8 border-2 border-[var(--cream-darker)] border-t-[var(--olive)] rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-muted)]">
              Loading challenges…
            </p>
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
