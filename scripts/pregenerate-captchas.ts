import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildChallenge } from '../packages/core/src/challenge/builder';
import { getGeneratorIds } from '../packages/core/src/generators/index';
import type { Challenge } from '../packages/core/src/types';

const repoRoot = resolve(process.cwd());
const generationsRoot = resolve(repoRoot, 'generations');
const LEGACY_ILLUSION_TYPE = 'illusion-generations';
const DEFAULT_TARGET_COUNT = 20;

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

interface LegacyIllusionMetadata {
  createdAt?: string;
  prompt?: string;
  environmentPrompt?: string;
  controlnetConditioningScale?: number;
  character?: {
    correct?: string;
    answerOptions?: string[];
    correctOption?: string;
    otherPotentialCharacters?: string[];
  };
  font?: Record<string, unknown>;
  position?: Record<string, unknown>;
  noise?: Record<string, unknown>;
  artifacts?: {
    outputImage?: {
      id?: string;
      outputUrl?: string;
    };
    controlImage?: {
      id?: string;
      uploadedUrl?: string;
    };
  };
}

function parseCountArg(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' || args[i] === '-n') {
      const parsed = Number.parseInt(args[i + 1] ?? '', 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return DEFAULT_TARGET_COUNT;
}

function getGenerationTypeDir(generationType: string): string {
  return resolve(generationsRoot, generationType);
}

function getChallengeDir(generationType: string): string {
  return resolve(getGenerationTypeDir(generationType), 'challenge');
}

function getMetadataPath(generationType: string): string {
  return resolve(getGenerationTypeDir(generationType), 'metadata.json');
}

async function ensureGenerationDirs(generationType: string): Promise<void> {
  await mkdir(getChallengeDir(generationType), { recursive: true });
}

async function readMetadata(generationType: string): Promise<GenerationMetadataFile> {
  const metadataPath = getMetadataPath(generationType);

  if (!existsSync(metadataPath)) {
    return {
      schemaVersion: 1,
      generationType,
      updatedAt: new Date().toISOString(),
      challenges: [],
    };
  }

  const raw = await readFile(metadataPath, 'utf8');
  const parsed = JSON.parse(raw) as GenerationMetadataFile;

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.challenges)) {
    return {
      schemaVersion: 1,
      generationType,
      updatedAt: new Date().toISOString(),
      challenges: [],
    };
  }

  return {
    schemaVersion: 1,
    generationType,
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    challenges: parsed.challenges,
  };
}

async function writeMetadata(generationType: string, metadata: GenerationMetadataFile): Promise<void> {
  metadata.updatedAt = new Date().toISOString();
  const path = getMetadataPath(generationType);
  await writeFile(path, JSON.stringify(metadata, null, 2), 'utf8');
}

function mimeToExtension(mimeType: Challenge['images'][number]['mimeType']): string {
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'image/webp') return '.webp';
  return '.png';
}

function extensionFromKnownImage(rootDir: string, imageUuid: string): string | null {
  const exts = ['.png', '.gif', '.webp'];
  for (const ext of exts) {
    if (existsSync(resolve(rootDir, `${imageUuid}${ext}`))) {
      return ext;
    }
  }
  return null;
}

async function moveFileIfExists(src: string, dest: string): Promise<boolean> {
  if (!existsSync(src)) {
    return false;
  }

  if (existsSync(dest)) {
    await unlink(src);
    return true;
  }

  await rename(src, dest);
  return true;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeCorrectAlternative(correctAnswer: string | string[]): string {
  return Array.isArray(correctAnswer) ? correctAnswer.join(',') : correctAnswer;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = tmp as T;
  }
  return copy;
}

function generateTokenLikeDistractor(correct: string, existing: Set<string>): string {
  const chars = correct.split('');
  if (chars.length <= 1) {
    const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'.split('');
    const fallback = pool[Math.floor(Math.random() * pool.length)] ?? 'A';
    if (!existing.has(fallback)) return fallback;
    return `${fallback}${Math.floor(Math.random() * 10)}`;
  }

  for (let attempts = 0; attempts < 50; attempts++) {
    const candidate = shuffle(chars).join('');
    if (!existing.has(candidate) && candidate !== correct) {
      return candidate;
    }
  }

  return `${correct.split('').reverse().join('')}-X`;
}

function ensureFourAlternatives(correctAlternative: string, options?: string[]): string[] {
  const base = uniqueStrings([...(options ?? []), correctAlternative]);
  const seen = new Set(base);

  while (base.length < 4) {
    const candidate = generateTokenLikeDistractor(correctAlternative, seen);
    if (!seen.has(candidate)) {
      seen.add(candidate);
      base.push(candidate);
    }
  }

  const trimmed = base.slice(0, 4);
  if (!trimmed.includes(correctAlternative)) {
    trimmed[0] = correctAlternative;
  }

  return shuffle(trimmed);
}

async function migrateLegacyIllusionEntries(): Promise<void> {
  await ensureGenerationDirs(LEGACY_ILLUSION_TYPE);

  const metadata = await readMetadata(LEGACY_ILLUSION_TYPE);
  const existingChallengeIds = new Set(metadata.challenges.map((c) => c.challengeId));

  const rootEntries = await readdir(generationsRoot);
  const legacyJsonFiles = rootEntries.filter((name) => name.toLowerCase().endsWith('.json'));

  let migrated = 0;

  for (const jsonFile of legacyJsonFiles) {
    const jsonPath = resolve(generationsRoot, jsonFile);
    let parsed: unknown;

    try {
      parsed = JSON.parse(await readFile(jsonPath, 'utf8'));
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }

    const legacyEntries = Object.entries(parsed as Record<string, unknown>);
    let fileHadLegacyShape = false;

    for (const [legacyChallengeId, value] of legacyEntries) {
      if (!value || typeof value !== 'object') continue;

      const legacy = value as LegacyIllusionMetadata;
      const outputUuid = legacy.artifacts?.outputImage?.id;
      const correctAlternative =
        legacy.character?.correctOption ??
        legacy.character?.correct ??
        legacy.character?.answerOptions?.[0];

      if (!outputUuid || !correctAlternative) {
        continue;
      }

      fileHadLegacyShape = true;

      if (existingChallengeIds.has(legacyChallengeId)) {
        continue;
      }

      const outputExt = extensionFromKnownImage(generationsRoot, outputUuid) ?? '.png';
      const outputSrc = resolve(generationsRoot, `${outputUuid}${outputExt}`);
      const outputDest = resolve(getChallengeDir(LEGACY_ILLUSION_TYPE), `${outputUuid}${outputExt}`);
      await moveFileIfExists(outputSrc, outputDest);

      const controlUuid = legacy.artifacts?.controlImage?.id;
      if (controlUuid) {
        const controlExt = extensionFromKnownImage(generationsRoot, controlUuid) ?? '.png';
        const controlSrc = resolve(generationsRoot, `${controlUuid}${controlExt}`);
        const controlDest = resolve(getChallengeDir(LEGACY_ILLUSION_TYPE), `${controlUuid}${controlExt}`);
        await moveFileIfExists(controlSrc, controlDest);
      }

      const answerAlternatives = ensureFourAlternatives(
        correctAlternative,
        legacy.character?.answerOptions,
      );

      metadata.challenges.push({
        challengeId: legacyChallengeId,
        imageUuid: outputUuid,
        imageFileName: `${outputUuid}${outputExt}`,
        answerAlternatives,
        correctAlternative,
        generationTimeMs: 0,
        generationTimestamp: legacy.createdAt ?? new Date().toISOString(),
        question: 'Which capital letter is hidden in this image?',
        generationSpecificMetadata: {
          migratedFrom: jsonFile,
          migrationNote: 'Migrated from legacy flat generations format; generationTimeMs unavailable.',
          prompt: legacy.prompt,
          environmentPrompt: legacy.environmentPrompt,
          controlnetConditioningScale: legacy.controlnetConditioningScale,
          character: legacy.character,
          font: legacy.font,
          position: legacy.position,
          noise: legacy.noise,
          controlImageUuid: controlUuid,
          controlImageUrl: legacy.artifacts?.controlImage?.uploadedUrl,
          outputImageUrl: legacy.artifacts?.outputImage?.outputUrl,
        },
      });

      existingChallengeIds.add(legacyChallengeId);
      migrated += 1;
    }

    if (fileHadLegacyShape) {
      await unlink(jsonPath);
    }
  }

  // Move any remaining loose UUID images into illusion-generations/challenge as fallback.
  const remaining = await readdir(generationsRoot);
  const uuidImagePattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|gif|webp)$/i;

  for (const name of remaining) {
    if (!uuidImagePattern.test(name)) continue;
    const src = resolve(generationsRoot, name);
    const dest = resolve(getChallengeDir(LEGACY_ILLUSION_TYPE), name);
    await moveFileIfExists(src, dest);
  }

  await writeMetadata(LEGACY_ILLUSION_TYPE, metadata);

  console.log(
    `Legacy migration complete for ${LEGACY_ILLUSION_TYPE}: migrated ${migrated} challenge metadata entries.`,
  );
}

async function generateForType(generationType: string, targetCount: number): Promise<void> {
  await ensureGenerationDirs(generationType);
  const metadata = await readMetadata(generationType);

  const existingCount = metadata.challenges.length;
  const needed = Math.max(0, targetCount - existingCount);

  if (needed === 0) {
    console.log(`${generationType}: already has ${existingCount} challenge(s), skipping generation.`);
    return;
  }

  console.log(`${generationType}: generating ${needed} challenge(s) to reach ${targetCount} total...`);

  for (let i = 0; i < needed; i++) {
    const started = Date.now();
    const challenge = await buildChallenge(generationType);

    if (!challenge.images.length) {
      console.warn(`${generationType}: generated challenge ${challenge.id} has no images; skipped.`);
      continue;
    }

    const imageRefs = [] as Array<{ uuid: string; fileName: string; mimeType: string; width: number; height: number }>;

    for (const image of challenge.images) {
      const imageUuid = randomUUID();
      const ext = mimeToExtension(image.mimeType);
      const fileName = `${imageUuid}${ext}`;
      const imagePath = resolve(getChallengeDir(generationType), fileName);
      await writeFile(imagePath, image.data);

      imageRefs.push({
        uuid: imageUuid,
        fileName,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
      });
    }

    const correctAlternative = normalizeCorrectAlternative(challenge.correctAnswer);
    const answerAlternatives = ensureFourAlternatives(correctAlternative, challenge.options);

    metadata.challenges.push({
      challengeId: randomUUID(),
      imageUuid: imageRefs[0]?.uuid ?? randomUUID(),
      imageFileName: imageRefs[0]?.fileName ?? '',
      answerAlternatives,
      correctAlternative,
      generationTimeMs: Date.now() - started,
      generationTimestamp: new Date().toISOString(),
      question: challenge.question,
      generationSpecificMetadata: {
        originalChallengeId: challenge.id,
        originalGeneratorId: challenge.generatorId,
        imageCount: challenge.images.length,
        imageRefs,
        metadata: challenge.metadata,
      },
    });

    process.stdout.write('.');
  }

  process.stdout.write('\n');
  await writeMetadata(generationType, metadata);
  console.log(`${generationType}: now has ${metadata.challenges.length} challenge(s).`);
}

async function main(): Promise<void> {
  const targetCount = parseCountArg();
  await mkdir(generationsRoot, { recursive: true });

  await migrateLegacyIllusionEntries();

  const generationTypes = getGeneratorIds();
  for (const generationType of generationTypes) {
    await generateForType(generationType, targetCount);
  }

  console.log('Pre-generation complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
