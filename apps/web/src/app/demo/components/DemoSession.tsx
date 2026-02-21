"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TestProgressBar } from "./TestProgressBar";
import { CaptchaQuestion } from "./CaptchaQuestion";
import { ResultsScreen } from "./ResultsScreen";
import type { CaptchaItem, UserAnswer, TestState } from "../types";
import { shuffle } from "../types";

interface DemoSessionProps {
  /** If provided, only challenges of this generator type are loaded */
  generatorType?: string;
  /** Display name shown in the idle card (e.g. "Illusory Contours") */
  title?: string;
  /** Subtitle shown in the idle card */
  description?: string;
  /** Where the back-link points */
  backHref?: string;
  /** Label for the back-link */
  backLabel?: string;
}

function formatType(type: string): string {
  return type
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function computeIsCorrect(
  answer: string | string[],
  correctAlternative: string,
): boolean {
  if (Array.isArray(answer)) {
    const correctSet = new Set(
      correctAlternative
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n > 0),
    );
    const submittedSet = new Set(
      answer
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n > 0),
    );
    if (
      [...correctSet].every((n) => submittedSet.has(n)) &&
      [...submittedSet].every((n) => correctSet.has(n))
    )
      return true;
    let errors = 0;
    for (const n of correctSet) {
      if (!submittedSet.has(n)) errors++;
    }
    for (const n of submittedSet) {
      if (!correctSet.has(n)) errors++;
    }
    return errors <= 1;
  }
  return answer === correctAlternative;
}

export function DemoSession({
  generatorType,
  title,
  description,
  backHref = "/",
  backLabel = "← Back",
}: DemoSessionProps) {
  const [state, setState] = useState<TestState>("idle");
  const [items, setItems] = useState<CaptchaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const answersRef = useRef<Record<string, UserAnswer>>({});

  const displayTitle =
    title ?? (generatorType ? formatType(generatorType) : "Captcha Test");
  const displayDescription =
    description ??
    (generatorType
      ? `Test your perception on ${formatType(generatorType)} challenges.`
      : "Test your perception against all saved captcha challenges. Each challenge is shown exactly once in a random order.");

  const apiUrl = generatorType
    ? `/api/captcha-test?type=${encodeURIComponent(generatorType)}`
    : "/api/captcha-test";

  const startTest = useCallback(async () => {
    setState("loading");
    setError(null);
    answersRef.current = {};
    setCurrentIndex(0);

    try {
      const res = await fetch(apiUrl);
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
  }, [apiUrl]);

  const handleAnswer = useCallback(
    async (answer: UserAnswer) => {
      const currentItem = items[currentIndex];
      if (!currentItem) return;

      answersRef.current[currentItem.challengeId] = answer;

      const nextIndex = currentIndex + 1;
      if (nextIndex >= items.length) {
        setState("loading");

        try {
          const results = items.map((item) => {
            const a = answersRef.current[item.challengeId]!;
            return {
              captchaId: item.challengeId,
              answerTimeMs: a.responseTimeMs,
              response: a.answer,
              isCorrect: computeIsCorrect(a.answer, item.correctAlternative),
            };
          });

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
            href={backHref}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--olive)] transition-colors"
          >
            {backLabel}
          </Link>
        </div>

        {state === "idle" && (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-xl sm:text-2xl">
                {displayTitle}
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                {displayDescription}
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
                Start Test
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
            key={items[currentIndex]!.challengeId}
            item={items[currentIndex]!}
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
