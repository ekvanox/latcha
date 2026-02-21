import type { Challenge, ChallengeImage } from '@lacha/core';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_GENERATIONS_DIR = resolve(import.meta.dirname, '../../../generations');
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

interface ParsedGenerationChallenge {
  generationType: string;
  entry: StoredChallengeEntry;
}

export interface LoadGenerationChallengesOptions {
  generationsDir?: string;
  generationType?: string;
  limit?: number;
}

function mimeTypeFromFileName(fileName: string): ChallengeImage['mimeType'] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

function isDirectoryLike(name: string): boolean {
  return !name.startsWith('.') && !name.includes('.');
}

async function listGenerationTypes(generationsDir: string): Promise<string[]> {
  const entries = await readdir(generationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(isDirectoryLike)
    .sort();
}

async function readMetadataFile(path: string): Promise<GenerationMetadataFile> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid metadata format in ${path}`);
  }

  const obj = parsed as Partial<GenerationMetadataFile>;

  if (!obj.generationType || !Array.isArray(obj.challenges)) {
    throw new Error(`Invalid metadata shape in ${path}`);
  }

  return {
    schemaVersion: 1,
    generationType: obj.generationType,
    updatedAt: obj.updatedAt ?? new Date(0).toISOString(),
    challenges: obj.challenges,
  };
}

function sortByTimestampDesc(entries: ParsedGenerationChallenge[]): ParsedGenerationChallenge[] {
  return [...entries].sort((a, b) => {
    const at = a.entry.generationTimestamp ? Date.parse(a.entry.generationTimestamp) : 0;
    const bt = b.entry.generationTimestamp ? Date.parse(b.entry.generationTimestamp) : 0;
    return bt - at;
  });
}

export async function loadGenerationTypes(generationsDir?: string): Promise<string[]> {
  const root = generationsDir ? resolve(generationsDir) : DEFAULT_GENERATIONS_DIR;
  return listGenerationTypes(root);
}

export async function loadGenerationChallenges(
  options: LoadGenerationChallengesOptions = {},
): Promise<Challenge[]> {
  const generationsDir = options.generationsDir
    ? resolve(options.generationsDir)
    : DEFAULT_GENERATIONS_DIR;

  const generationTypes = options.generationType
    ? [options.generationType]
    : await listGenerationTypes(generationsDir);

  if (generationTypes.length === 0) {
    throw new Error(`No generation type folders found in ${generationsDir}`);
  }

  const parsed: ParsedGenerationChallenge[] = [];

  for (const generationType of generationTypes) {
    const metadataPath = resolve(generationsDir, generationType, 'metadata.json');

    try {
      const metadata = await readMetadataFile(metadataPath);
      for (const entry of metadata.challenges) {
        parsed.push({ generationType: metadata.generationType, entry });
      }
    } catch (error) {
      console.warn(
        `Skipping generation type ${generationType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const ordered = sortByTimestampDesc(parsed);
  const selected =
    typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
      ? ordered.slice(0, options.limit)
      : ordered;

  const challenges: Challenge[] = [];

  for (const item of selected) {
    const { generationType, entry } = item;

    if (!entry.correctAlternative) {
      continue;
    }

    const challengeDir = resolve(generationsDir, generationType, 'challenge');

    // Check if this is a multi-image grid challenge (select-all)
    const imageRefs = Array.isArray(entry.generationSpecificMetadata?.imageRefs)
      ? (entry.generationSpecificMetadata.imageRefs as Array<{ uuid: string; fileName: string; mimeType?: string }>)
      : null;

    const isGridChallenge = imageRefs && imageRefs.length === 9;

    if (isGridChallenge) {
      // Load all 9 cell images
      try {
        const images: ChallengeImage[] = [];
        for (const ref of imageRefs) {
          const imagePath = resolve(challengeDir, ref.fileName);
          const imageData = await readFile(imagePath);
          const mimeType = mimeTypeFromFileName(ref.fileName);
          images.push({ data: imageData, mimeType, width: 512, height: 512 });
        }

        // correctAlternative is stored as "1,3,7" — split into string array
        const correctAnswer = entry.correctAlternative.split(',').map((s) => s.trim()).filter(Boolean);

        challenges.push({
          id: entry.challengeId,
          generatorId: generationType,
          images,
          question: entry.question,
          correctAnswer,
          metadata: {
            format: 'select-all',
            source: 'pregenerated',
            generationType,
            generationTimeMs: entry.generationTimeMs,
            generationTimestamp: entry.generationTimestamp,
            generationSpecificMetadata: entry.generationSpecificMetadata,
          },
          expiresAt: Date.now() + 1000 * 60 * 60,
        });
      } catch (error) {
        console.warn(
          `Skipping grid challenge ${entry.challengeId}: images not readable (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      continue;
    }

    // Standard single-image multiple-choice challenge
    if (
      !entry.imageUuid ||
      !UUID_PATTERN.test(entry.imageUuid) ||
      !entry.imageFileName ||
      !entry.answerAlternatives ||
      entry.answerAlternatives.length < 4
    ) {
      continue;
    }

    const imagePath = resolve(challengeDir, entry.imageFileName);

    try {
      const imageData = await readFile(imagePath);
      const mimeType = mimeTypeFromFileName(entry.imageFileName);

      challenges.push({
        id: entry.challengeId,
        generatorId: generationType,
        images: [
          {
            data: imageData,
            mimeType,
            width: 512,
            height: 512,
          },
        ],
        question: entry.question,
        options: entry.answerAlternatives,
        correctAnswer: entry.correctAlternative,
        metadata: {
          source: 'pregenerated',
          generationType,
          imageUuid: entry.imageUuid,
          generationTimeMs: entry.generationTimeMs,
          generationTimestamp: entry.generationTimestamp,
          generationSpecificMetadata: entry.generationSpecificMetadata,
        },
        expiresAt: Date.now() + 1000 * 60 * 60,
      });
    } catch (error) {
      console.warn(
        `Skipping challenge ${entry.challengeId}: image not readable at ${imagePath} (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  if (challenges.length === 0) {
    throw new Error('No usable pre-generated challenges found.');
  }

  return challenges;
}
