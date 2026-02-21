import type { Challenge } from '@latcha/core';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GenerationImageMimeType = Challenge['images'][number]['mimeType'];

interface StoredChallengeEntry {
  challengeId: string;
  imageUuid: string;
  imageFileName: string;
  answerAlternatives: string[];
  correctAlternative: string;
  generationTimeMs: number;
  generationTimestamp: string;
  question: string;
  generationSpecificMetadata: Record<string, unknown>;
}

interface GenerationMetadataFile {
  schemaVersion: 1;
  generationType: string;
  updatedAt: string;
  challenges: StoredChallengeEntry[];
}

export interface GenerationVisualizationItem {
  challengeId: string;
  generationType: string;
  createdAt: string;
  prompt: string;
  environmentPrompt: string;
  controlnetConditioningScale: number;
  answerAlternatives: string[];
  correctAlternative: string;
  imageUuid: string;
  controlImageUuid?: string;
  generationTimeMs: number;
  question: string;
  generationSpecificMetadata: Record<string, unknown>;
}

interface BuildGenerationChallengeOptions {
  challengeId?: string;
  generationType?: string;
}

function getGenerationsDirCandidates(): string[] {
  return [
    resolve(process.cwd(), 'generations'),
    resolve(process.cwd(), '../generations'),
    resolve(process.cwd(), '../../generations'),
    resolve(process.cwd(), '../../../generations'),
  ];
}

export function resolveGenerationsDir(): string {
  const found = getGenerationsDirCandidates().find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Could not locate generations directory. Expected ./generations at repo root.');
  }
  return found;
}

function sortByCreatedAtDesc(items: GenerationVisualizationItem[]): GenerationVisualizationItem[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function readGenerationTypes(generationsDir: string): Promise<string[]> {
  const entries = await readdir(generationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.'))
    .sort();
}

async function readGenerationMetadata(
  generationsDir: string,
  generationType: string,
): Promise<GenerationMetadataFile | null> {
  const metadataPath = resolve(generationsDir, generationType, 'metadata.json');
  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    const raw = await readFile(metadataPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const metadata = parsed as Partial<GenerationMetadataFile>;
    if (!metadata.generationType || !Array.isArray(metadata.challenges)) {
      return null;
    }

    return {
      schemaVersion: 1,
      generationType: metadata.generationType,
      updatedAt: metadata.updatedAt ?? new Date(0).toISOString(),
      challenges: metadata.challenges,
    };
  } catch {
    return null;
  }
}

function getStringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}

function getNumberField(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeVisualizationItem(
  generationType: string,
  entry: StoredChallengeEntry,
): GenerationVisualizationItem | null {
  if (
    !entry.challengeId ||
    !entry.imageUuid ||
    !UUID_PATTERN.test(entry.imageUuid) ||
    !Array.isArray(entry.answerAlternatives) ||
    entry.answerAlternatives.length < 4 ||
    !entry.correctAlternative
  ) {
    return null;
  }

  const specific = entry.generationSpecificMetadata ?? {};
  const specificObj =
    specific && typeof specific === 'object' ? (specific as Record<string, unknown>) : {};

  const imageRefs = specificObj.imageRefs;
  const controlImageUuid = Array.isArray(imageRefs)
    ? (() => {
        for (const ref of imageRefs) {
          if (!ref || typeof ref !== 'object') continue;
          const obj = ref as Record<string, unknown>;
          if (obj.role === 'control' && typeof obj.uuid === 'string') {
            return obj.uuid;
          }
        }
        return undefined;
      })()
    : undefined;

  return {
    challengeId: entry.challengeId,
    generationType,
    createdAt: entry.generationTimestamp,
    prompt: getStringField(specificObj, 'prompt'),
    environmentPrompt: getStringField(specificObj, 'environmentPrompt'),
    controlnetConditioningScale: getNumberField(specificObj, 'controlnetConditioningScale'),
    answerAlternatives: entry.answerAlternatives,
    correctAlternative: entry.correctAlternative,
    imageUuid: entry.imageUuid,
    controlImageUuid,
    generationTimeMs: entry.generationTimeMs,
    question: entry.question,
    generationSpecificMetadata: specificObj,
  };
}

export async function listGenerationVisualizations(
  limit = 100,
  generationType?: string,
): Promise<GenerationVisualizationItem[]> {
  const generationsDir = resolveGenerationsDir();
  const generationTypes = generationType
    ? [generationType]
    : await readGenerationTypes(generationsDir);

  const allItems: GenerationVisualizationItem[] = [];

  for (const type of generationTypes) {
    const metadata = await readGenerationMetadata(generationsDir, type);
    if (!metadata) continue;

    for (const entry of metadata.challenges) {
      const item = normalizeVisualizationItem(metadata.generationType, entry);
      if (item) {
        allItems.push(item);
      }
    }
  }

  return sortByCreatedAtDesc(allItems).slice(0, limit);
}

export function resolveGenerationImageFile(
  generationType: string,
  imageUuid: string,
): { filePath: string; mimeType: GenerationImageMimeType } {
  if (!UUID_PATTERN.test(imageUuid)) {
    throw new Error('Invalid image id format.');
  }

  const generationsDir = resolveGenerationsDir();
  const challengeDir = resolve(generationsDir, generationType, 'challenge');

  const candidates = [
    { ext: '.png', mimeType: 'image/png' as const },
    { ext: '.gif', mimeType: 'image/gif' as const },
    { ext: '.webp', mimeType: 'image/webp' as const },
  ];

  for (const candidate of candidates) {
    const filePath = resolve(challengeDir, `${imageUuid}${candidate.ext}`);
    if (existsSync(filePath)) {
      return {
        filePath,
        mimeType: candidate.mimeType,
      };
    }
  }

  throw new Error(`Image not found for ${generationType}/${imageUuid}`);
}

export async function buildGenerationChallenge(
  options: BuildGenerationChallengeOptions = {},
): Promise<Challenge> {
  const all = await listGenerationVisualizations(10_000, options.generationType);

  if (all.length === 0) {
    throw new Error('No saved generations available.');
  }

  const selected = options.challengeId
    ? all.find((entry) => entry.challengeId === options.challengeId)
    : all[Math.floor(Math.random() * all.length)];

  if (!selected) {
    throw new Error(`Saved generation not found for challengeId=${options.challengeId}`);
  }

  const { filePath, mimeType } = resolveGenerationImageFile(
    selected.generationType,
    selected.imageUuid,
  );
  const imageData = await readFile(filePath);

  const correctAlternative = selected.correctAlternative;

  return {
    id: `generation-${selected.challengeId}-${Date.now()}`,
    generatorId: selected.generationType,
    images: [
      {
        data: imageData,
        mimeType,
        width: 512,
        height: 512,
      },
    ],
    question: selected.question,
    options: selected.answerAlternatives,
    correctAnswer: correctAlternative,
    metadata: {
      format: 'multiple-choice',
      source: 'pregenerated',
      challengeId: selected.challengeId,
      generationType: selected.generationType,
      generationTimeMs: selected.generationTimeMs,
      generatedAt: selected.createdAt,
      generationSpecificMetadata: selected.generationSpecificMetadata,
    },
    expiresAt: Date.now() + 1000 * 60 * 15,
  };
}
