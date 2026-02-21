"use client";

import { useState, useRef, useCallback } from "react";
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

// ── Tolerance scoring for select-all (±1 total error) ─────────────────────────

function parseNumericSet(str: string): Set<number> {
  return new Set(
    str
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0),
  );
}

function isSelectAllCorrect(
  selectedIndices: number[],
  correctAlternative: string,
): boolean {
  const correctSet = parseNumericSet(correctAlternative);
  const selectedSet = new Set(selectedIndices);

  if (
    [...correctSet].every((n) => selectedSet.has(n)) &&
    [...selectedSet].every((n) => correctSet.has(n))
  ) {
    return true;
  }

  let errors = 0;
  for (const n of correctSet) {
    if (!selectedSet.has(n)) errors++;
  }
  for (const n of selectedSet) {
    if (!correctSet.has(n)) errors++;
  }
  return errors <= 1;
}

// ── Multiple-choice variant ────────────────────────────────────────────────────

function MultipleChoiceQuestion({
  item,
  onAnswer,
  startTimeRef,
}: {
  item: CaptchaItem;
  onAnswer: (answer: UserAnswer) => void;
  startTimeRef: React.MutableRefObject<number>;
}) {
  const [shuffledAlternatives] = useState<string[]>(() =>
    shuffle(item.answerAlternatives),
  );
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("unanswered");
  const [imageLoaded, setImageLoaded] = useState(false);

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
    onAnswer({ answer: selectedAnswer ?? SKIP_ANSWER, responseTimeMs });
  }, [onAnswer, selectedAnswer, startTimeRef]);

  const getButtonStyle = (option: string): string => {
    if (answerState !== "answered") {
      return "border-[var(--card-border)] hover:border-[var(--olive-muted)] hover:bg-[var(--cream-dark)] text-[var(--foreground)]";
    }
    const isCorrect = option === item.correctAlternative;
    const isSelected = option === selectedAnswer;
    if (isCorrect) return "border-[#4a7c2f] bg-[#eef4e8] text-[#2d5a1b]";
    if (isSelected && !isCorrect)
      return "border-[#c0392b] bg-[#fdf0ee] text-[#922b21]";
    return "border-[var(--card-border)] opacity-50 text-[var(--text-secondary)]";
  };

  return (
    <>
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
    </>
  );
}

// ── Select-all (3×3 grid) variant ─────────────────────────────────────────────

function SelectAllQuestion({
  item,
  onAnswer,
  startTimeRef,
}: {
  item: CaptchaItem;
  onAnswer: (answer: UserAnswer) => void;
  startTimeRef: React.MutableRefObject<number>;
}) {
  const gridImages = item.gridImageUrls ?? [];
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [answerState, setAnswerState] = useState<AnswerState>("unanswered");
  const [loadedCells, setLoadedCells] = useState<Set<number>>(new Set());

  const correctCells = parseNumericSet(item.correctAlternative);

  const toggleCell = useCallback(
    (cellIndex: number) => {
      if (answerState === "answered") return;
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (next.has(cellIndex)) {
          next.delete(cellIndex);
        } else {
          next.add(cellIndex);
        }
        return next;
      });
    },
    [answerState],
  );

  const handleSkip = useCallback(() => {
    if (answerState === "answered") return;
    const responseTimeMs = Date.now() - startTimeRef.current;
    setAnswerState("answered");
    onAnswer({ answer: SKIP_ANSWER, responseTimeMs });
  }, [answerState, onAnswer, startTimeRef]);

  const handleSubmit = useCallback(() => {
    if (answerState === "answered" || selectedCells.size === 0) return;
    const responseTimeMs = Date.now() - startTimeRef.current;
    setAnswerState("answered");
    const sortedSelected = Array.from(selectedCells).sort((a, b) => a - b);
    onAnswer({
      answer: sortedSelected.map(String),
      responseTimeMs,
    });
  }, [answerState, onAnswer, selectedCells, startTimeRef]);

  const handleNext = useCallback(() => {
    const responseTimeMs = Date.now() - startTimeRef.current;
    const sortedSelected = Array.from(selectedCells).sort((a, b) => a - b);
    onAnswer({ answer: sortedSelected.map(String), responseTimeMs });
  }, [onAnswer, selectedCells, startTimeRef]);

  const getCellStyle = (cellIndex: number): string => {
    const isSelected = selectedCells.has(cellIndex);

    if (answerState === "unanswered") {
      return isSelected
        ? "border-[var(--olive)] ring-2 ring-[var(--olive)] ring-opacity-40"
        : "border-[var(--card-border)] hover:border-[var(--olive-muted)]";
    }

    const isCorrect = correctCells.has(cellIndex);
    if (isCorrect && isSelected) return "border-[#4a7c2f] ring-2 ring-[#4a7c2f]";
    if (isCorrect && !isSelected) return "border-[#b8860b] ring-2 ring-[#b8860b]";
    if (!isCorrect && isSelected) return "border-[#c0392b] ring-2 ring-[#c0392b]";
    return "border-[var(--card-border)] opacity-60";
  };

  const wasSkipped = answerState === "answered" && selectedCells.size === 0;
  const isCorrect = isSelectAllCorrect(
    Array.from(selectedCells),
    item.correctAlternative,
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {gridImages.map((url, i) => {
          const cellIndex = i + 1;
          const isLoaded = loadedCells.has(cellIndex);
          return (
            <button
              key={`${item.challengeId}-cell-${cellIndex}`}
              onClick={() => toggleCell(cellIndex)}
              disabled={answerState === "answered"}
              className={cn(
                "relative aspect-square rounded-md border-2 overflow-hidden transition-all",
                answerState === "answered" ? "cursor-default" : "cursor-pointer",
                getCellStyle(cellIndex),
              )}
            >
              {!isLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--cream-dark)]">
                  <div className="w-4 h-4 border-2 border-cream-darker border-t-olive rounded-full animate-spin" />
                </div>
              )}
              <Image
                src={url}
                alt={`Cell ${cellIndex}`}
                fill
                unoptimized
                className={cn(
                  "object-cover transition-opacity duration-200",
                  isLoaded ? "opacity-100" : "opacity-0",
                )}
                onLoad={() =>
                  setLoadedCells((prev) => new Set([...prev, cellIndex]))
                }
              />
              <span className="absolute top-1 left-1 text-[10px] font-bold text-white bg-black/40 rounded px-1 leading-tight select-none">
                {cellIndex}
              </span>
              {selectedCells.has(cellIndex) && answerState === "unanswered" && (
                <span className="absolute top-1 right-1 text-white bg-[var(--olive)] rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold select-none">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {answerState === "unanswered" && (
        <div className="space-y-2">
          <button
            onClick={handleSubmit}
            disabled={selectedCells.size === 0}
            className={cn(
              "w-full py-3 rounded-lg font-semibold text-sm transition-colors",
              selectedCells.size > 0
                ? "bg-olive text-white hover:bg-olive-light"
                : "bg-[var(--cream-dark)] text-[var(--text-muted)] cursor-not-allowed",
            )}
          >
            Submit ({selectedCells.size} selected)
          </button>
          <button
            onClick={handleSkip}
            className="w-full py-2 text-sm text-text-secondary hover:text-foreground transition-colors"
          >
            Skip / I don&apos;t know
          </button>
        </div>
      )}

      {answerState === "answered" && (
        <div className="space-y-3">
          <p className="text-center text-sm font-medium">
            {wasSkipped ? (
              <span className="text-text-secondary">Skipped</span>
            ) : isCorrect ? (
              <span className="text-[#2d5a1b]">Correct ✓</span>
            ) : (
              <span className="text-[#922b21]">
                Incorrect — letter cells were:{" "}
                {Array.from(correctCells)
                  .sort((a, b) => a - b)
                  .join(", ")}
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
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CaptchaQuestion({ item, onAnswer }: CaptchaQuestionProps) {
  const [startTime] = useState<number>(() => Date.now());
  const startTimeRef = useRef<number>(startTime);
  const isGrid =
    item.format === "select-all" && Array.isArray(item.gridImageUrls);

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardContent className="p-4 sm:p-6 space-y-5">
        <p className="text-sm sm:text-base font-medium text-center text-foreground">
          {item.question}
        </p>

        {isGrid ? (
          <SelectAllQuestion
            item={item}
            onAnswer={onAnswer}
            startTimeRef={startTimeRef}
          />
        ) : (
          <MultipleChoiceQuestion
            item={item}
            onAnswer={onAnswer}
            startTimeRef={startTimeRef}
          />
        )}
      </CardContent>
    </Card>
  );
}
