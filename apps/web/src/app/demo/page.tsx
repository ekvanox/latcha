'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CaptchaWidget } from '../components/CaptchaWidget';

const GENERATORS = [
  { id: 'grid-overlay', name: 'Grid Overlay', description: 'Text behind geometric patterns' },
  { id: 'proximity-text', name: 'Gestalt Proximity', description: 'Letters from dot spacing' },
  { id: 'partial-occlusion', name: 'Partial Occlusion', description: 'Text behind occluding bars' },
];

export default function DemoPage() {
  const [selectedGenerator, setSelectedGenerator] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen p-8 font-[family-name:var(--font-geist-sans)]">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-bold">Lacha Demo</h1>
          <div className="w-12" />
        </div>

        {/* Generator selector */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Challenge Type
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedGenerator(undefined)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedGenerator === undefined
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              Random
            </button>
            {GENERATORS.map((gen) => (
              <button
                key={gen.id}
                onClick={() => setSelectedGenerator(gen.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedGenerator === gen.id
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                }`}
                title={gen.description}
              >
                {gen.name}
              </button>
            ))}
          </div>
        </div>

        {/* CAPTCHA Widget */}
        <CaptchaWidget key={selectedGenerator ?? 'random'} generator={selectedGenerator} />

        {/* Info */}
        <div className="text-sm text-gray-500 space-y-2 border-t pt-6 dark:border-gray-800">
          <p>
            <strong>How it works:</strong> Each challenge exploits a specific perceptual gap
            between humans and AI vision models.
          </p>
          <p>
            Humans perceive these images effortlessly through gestalt grouping,
            amodal completion, and other visual mechanisms that AI models lack.
          </p>
        </div>
      </div>
    </div>
  );
}