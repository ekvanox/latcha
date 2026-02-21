'use client';

import { useEffect, useMemo, useState } from 'react';

interface VisualizationItem {
  challengeId: string;
  generationType: string;
  createdAt: string;
  prompt: string;
  environmentPrompt: string;
  controlnetConditioningScale: number;
  answerAlternatives: string[];
  question: string;
  generationTimeMs: number;
  generationSpecificMetadata: Record<string, unknown>;
  outputImageUrl: string;
  controlImageUrl: string | null;
}

interface ApiResponse {
  items: VisualizationItem[];
  count: number;
  error?: string;
}

export function GenerationVisualizer() {
  const [items, setItems] = useState<VisualizationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/generations?limit=200');
        const data = (await res.json()) as ApiResponse;

        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to load generation visualizations');
        }

        if (!cancelled) {
          setItems(data.items);
          setSelectedId((current) => current || data.items[0]?.challengeId || '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load generation visualizations');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => items.find((item) => item.challengeId === selectedId) ?? items[0],
    [items, selectedId],
  );

  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto border rounded-xl p-6 bg-white dark:bg-gray-900 shadow-sm">
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-3xl mx-auto border rounded-xl p-6 bg-white dark:bg-gray-900 shadow-sm text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="w-full max-w-3xl mx-auto border rounded-xl p-6 bg-white dark:bg-gray-900 shadow-sm text-sm text-gray-500">
        No saved generations found yet. Run the illusion script to populate the folder.
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto border rounded-xl p-6 bg-white dark:bg-gray-900 shadow-sm space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Saved generation
        </label>
        <select
          value={selected.challengeId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
        >
          {items.map((item) => (
            <option key={item.challengeId} value={item.challengeId}>
              {new Date(item.createdAt).toLocaleString()} — {item.generationType}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-gray-500">Output image</p>
          <img
            src={selected.outputImageUrl}
            alt="Generated illusion output"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-800"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-gray-500">Control image</p>
          {selected.controlImageUrl ? (
            <img
              src={selected.controlImageUrl}
              alt="Control image"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800"
            />
          ) : (
            <div className="w-full h-full min-h-[220px] rounded-lg border border-dashed border-gray-300 dark:border-gray-700 grid place-items-center text-sm text-gray-500">
              No control image available
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300 border-t pt-4 dark:border-gray-800">
        <p><strong>Generation type:</strong> {selected.generationType}</p>
        <p><strong>Prompt:</strong> {selected.prompt || '—'}</p>
        <p><strong>Environment:</strong> {selected.environmentPrompt || '—'}</p>
        <p><strong>Question:</strong> {selected.question}</p>
        <p>
          <strong>Letter options:</strong>{' '}
          {selected.answerAlternatives.map((option, idx) => (
            <span
              key={`${selected.challengeId}-${option}-${idx}`}
              className="inline-block mr-2 mb-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              {String.fromCharCode(65 + idx)}: {option}
            </span>
          ))}
        </p>
        <p>
          <strong>Conditioning scale:</strong> {selected.controlnetConditioningScale}
        </p>
        <p>
          <strong>Generation time:</strong> {selected.generationTimeMs} ms
        </p>
      </div>
    </div>
  );
}
