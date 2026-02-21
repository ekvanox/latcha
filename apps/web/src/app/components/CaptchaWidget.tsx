'use client';

import { useState, useCallback } from 'react';
import { MultipleChoice } from './MultipleChoice';
import { ImageGrid } from './ImageGrid';

interface ChallengeData {
  challengeId: string;
  generatorId: string;
  images: { data: string; mimeType: string; width: number; height: number }[];
  question: string;
  options?: string[];
  format: string;
}

type WidgetState = 'idle' | 'loading' | 'challenge' | 'verifying' | 'success' | 'failure';

interface CaptchaWidgetProps {
  generator?: string;
}

export function CaptchaWidget({ generator }: CaptchaWidgetProps) {
  const [state, setState] = useState<WidgetState>('idle');
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchChallenge = useCallback(async () => {
    setState('loading');
    setError(null);
    setSelectedOption(null);
    setSelectedImages(new Set());

    try {
      const params = generator ? `?generator=${generator}` : '';
      const res = await fetch(`/api/challenge${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch challenge');
      }

      setChallenge(data);
      setState('challenge');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load challenge');
      setState('idle');
    }
  }, [generator]);

  const submitAnswer = useCallback(async () => {
    if (!challenge) return;

    setState('verifying');

    const answer = challenge.options
      ? selectedOption
      : [...selectedImages].map((i) => String(i + 1));

    try {
      const res = await fetch('/api/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.challengeId, answer }),
      });
      const data = await res.json();
      setState(data.success ? 'success' : 'failure');
    } catch {
      setError('Verification failed');
      setState('failure');
    }
  }, [challenge, selectedOption, selectedImages]);

  const handleImageToggle = useCallback((index: number) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  return (
    <div className="w-full max-w-md mx-auto border rounded-xl p-6 bg-white dark:bg-gray-900 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            state === 'success' ? 'bg-green-500' :
            state === 'failure' ? 'bg-red-500' :
            state === 'loading' || state === 'verifying' ? 'bg-yellow-500 animate-pulse' :
            'bg-gray-300'
          }`} />
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {state === 'idle' && 'Click to verify you\'re human'}
            {state === 'loading' && 'Loading challenge...'}
            {state === 'challenge' && challenge?.question}
            {state === 'verifying' && 'Verifying...'}
            {state === 'success' && 'Verified! You\'re human.'}
            {state === 'failure' && 'Incorrect. Try again.'}
          </span>
        </div>
        {challenge && (
          <span className="text-xs text-gray-400 font-mono">{challenge.generatorId}</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* Idle state: big click target */}
      {state === 'idle' && (
        <button
          onClick={fetchChallenge}
          className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="text-lg font-medium text-gray-600 dark:text-gray-400">
            I&apos;m not a robot
          </span>
        </button>
      )}

      {/* Loading spinner */}
      {state === 'loading' && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Challenge display */}
      {(state === 'challenge' || state === 'verifying') && challenge && (
        <>
          {/* Image(s) */}
          {challenge.images.length === 1 ? (
            <div className="flex justify-center">
              <img
                src={`data:${challenge.images[0].mimeType};base64,${challenge.images[0].data}`}
                alt="CAPTCHA challenge"
                className="rounded-lg max-w-full"
                style={{ maxHeight: 250 }}
              />
            </div>
          ) : (
            <ImageGrid
              images={challenge.images}
              selected={selectedImages}
              onToggle={handleImageToggle}
              disabled={state === 'verifying'}
            />
          )}

          {/* Options (multiple choice) */}
          {challenge.options && (
            <MultipleChoice
              options={challenge.options}
              selected={selectedOption}
              onSelect={setSelectedOption}
              disabled={state === 'verifying'}
            />
          )}

          {/* Submit button */}
          <button
            onClick={submitAnswer}
            disabled={state === 'verifying' || (!selectedOption && selectedImages.size === 0)}
            className={`
              w-full py-3 rounded-lg font-medium transition-colors
              ${(selectedOption || selectedImages.size > 0)
                ? 'bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'}
            `}
          >
            {state === 'verifying' ? 'Verifying...' : 'Verify'}
          </button>
        </>
      )}

      {/* Success */}
      {state === 'success' && (
        <div className="text-center py-6 space-y-3">
          <div className="text-4xl">&#10003;</div>
          <p className="text-green-600 font-medium">Verification successful!</p>
          <button
            onClick={fetchChallenge}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Try another
          </button>
        </div>
      )}

      {/* Failure */}
      {state === 'failure' && (
        <div className="text-center py-6 space-y-3">
          <div className="text-4xl">&#10007;</div>
          <p className="text-red-600 font-medium">Incorrect answer</p>
          <button
            onClick={fetchChallenge}
            className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
