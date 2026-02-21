"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CaptchaItem, UserAnswer } from "../types";
import { shuffle, SKIP_ANSWER } from "../types";

interface CaptchaQuestionProps {
  item: CaptchaItem;
  onAnswer: (answer: UserAnswer) => void;
}

type AnswerState = "unanswered" | "answered";

export function CaptchaQuestion({ item, onAnswer }: CaptchaQuestionProps) {
  const [shuffledAlternatives, setShuffledAlternatives] = useState<string[]>(
    [],
  );
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("unanswered");
  const [imageLoaded, setImageLoaded] = useState(false);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    setShuffledAlternatives(shuffle(item.answerAlternatives));
    setSelectedAnswer(null);
    setAnswerState("unanswered");
    setImageLoaded(false);
    startTimeRef.current = Date.now();
  }, [item]);

  const handleSelect = useCallback(
    (answer: string) => {
      if (answerState === "answered") return;
      setSelectedAnswer(answer);
      setAnswerState("answered");
    },
    [answerState],
  );

  const handleSkip = useCallback(() => {
    if (answerState === "answered") return;
    setSelectedAnswer(SKIP_ANSWER);
    setAnswerState("answered");
  }, [answerState]);

  const handleNext = useCallback(() => {
    const responseTimeMs = Date.now() - startTimeRef.current;
    onAnswer({
      answer: selectedAnswer ?? SKIP_ANSWER,
      responseTimeMs,
    });
  }, [onAnswer, selectedAnswer]);

  const getButtonStyle = (option: string): string => {
    if (answerState !== "answered") {
      return "border-[var(--card-border)] hover:border-[var(--olive-muted)] hover:bg-[var(--cream-dark)] text-[var(--foreground)]";
    }

    const isCorrect = option === item.correctAlternative;
    const isSelected = option === selectedAnswer;

    if (isCorrect) {
      return "border-[#4a7c2f] bg-[#eef4e8] text-[#2d5a1b]";
    }
    if (isSelected && !isCorrect) {
      return "border-[#c0392b] bg-[#fdf0ee] text-[#922b21]";
    }
    return "border-[var(--card-border)] opacity-50 text-[var(--text-secondary)]";
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardContent className="p-4 sm:p-6 space-y-5">
        <p className="text-sm sm:text-base font-medium text-center text-foreground">
          {item.question}
        </p>

        <div className="flex justify-center">
          <div className="relative rounded-lg overflow-hidden bg-cream-dark">
            {!imageLoaded && (
              <div className="w-full h-48 sm:h-64 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-cream-darker border-t-olive rounded-full animate-spin" />
              </div>
            )}
            <Image
              src={item.imageUrl}
              alt="CAPTCHA challenge"
              width={400}
              height={256}
              unoptimized
              className={cn(
                "max-w-full max-h-64 sm:max-h-80 object-contain transition-opacity duration-200",
                imageLoaded ? "opacity-100" : "opacity-0 absolute",
              )}
              onLoad={() => setImageLoaded(true)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {shuffledAlternatives.map((option, i) => {
            const letter = String.fromCharCode(65 + i);
            return (
              <button
                key={`${item.challengeId}-${option}`}
                onClick={() => handleSelect(option)}
                disabled={answerState === "answered"}
                className={cn(
                  "px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg border-2 text-left font-medium transition-all text-sm sm:text-base",
                  answerState === "answered"
                    ? "cursor-default"
                    : "cursor-pointer",
                  getButtonStyle(option),
                )}
              >
                <span className="text-xs sm:text-sm text-olive-muted mr-1.5">
                  {letter})
                </span>
                {option}
              </button>
            );
          })}
        </div>

        {answerState === "unanswered" && (
          <button
            onClick={handleSkip}
            className="w-full py-2 text-sm text-text-secondary hover:text-foreground transition-colors"
          >
            Skip / I don&apos;t know
          </button>
        )}

        {answerState === "answered" && (
          <div className="space-y-3">
            <p className="text-center text-sm font-medium">
              {selectedAnswer === SKIP_ANSWER ? (
                <span className="text-text-secondary">Skipped</span>
              ) : selectedAnswer === item.correctAlternative ? (
                <span className="text-[#2d5a1b]">Correct ✓</span>
              ) : (
                <span className="text-[#922b21]">
                  Incorrect — the answer was {item.correctAlternative}
                </span>
              )}
            </p>
            <button
              onClick={handleNext}
              className="w-full py-3 rounded-lg bg-olive text-white font-semibold text-sm hover:bg-olive-light transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
