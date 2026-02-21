import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import dotenv from "dotenv";

import { buildChallenge } from "../packages/core/src/challenge/builder";

// Load .env from repo root
const repoRoot = resolve(process.cwd());
dotenv.config({ path: resolve(repoRoot, ".env") });

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helpers (same as pregenerate-captchas.ts)
function mimeToExtension(mimeType: string): string {
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

function normalizeCorrectAlternative(correctAnswer: string | string[]): string {
  return Array.isArray(correctAnswer) ? correctAnswer.join(",") : correctAnswer;
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

function generateTokenLikeDistractor(
  correct: string,
  existing: Set<string>,
): string {
  const chars = correct.split("");
  if (chars.length <= 1) {
    const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789".split("");
    const fallback = pool[Math.floor(Math.random() * pool.length)] ?? "A";
    if (!existing.has(fallback)) return fallback;
    return `${fallback}${Math.floor(Math.random() * 10)}`;
  }
  for (let attempts = 0; attempts < 50; attempts++) {
    const candidate = shuffle(chars).join("");
    if (!existing.has(candidate) && candidate !== correct) {
      return candidate;
    }
  }
  return `${correct.split("").reverse().join("")}-X`;
}

function ensureFourAlternatives(
  correctAlternative: string,
  options?: string[],
): string[] {
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

async function generateAndSync(generationType: string) {
  console.log(`Generating challenge for ${generationType}...`);
  const started = Date.now();

  const challenge = await buildChallenge(generationType);
  const generationTimeMs = Date.now() - started;

  if (!challenge.images.length) {
    throw new Error(
      `${generationType}: generated challenge ${challenge.id} has no images`,
    );
  }

  const imageRefs: Array<{
    uuid: string;
    fileName: string;
    mimeType: string;
    width: number;
    height: number;
  }> = [];
  const challengeId = randomUUID();
  const generationTimestamp = new Date().toISOString();

  for (const image of challenge.images) {
    const imageUuid = randomUUID();
    const ext = mimeToExtension(image.mimeType);
    const fileName = `${imageUuid}${ext}`;
    const bucketPath = `${generationType}/${fileName}`;

    console.log(`  Uploading ${fileName} to bucket captchas/${bucketPath}...`);

    const { error: storageError } = await supabase.storage
      .from("captchas")
      .upload(bucketPath, image.data, {
        contentType: image.mimeType,
        upsert: true,
      });

    if (storageError) {
      throw new Error(`Failed to upload ${fileName}: ${storageError.message}`);
    }

    imageRefs.push({
      uuid: imageUuid,
      fileName,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
    });
  }

  const correctAlternative = normalizeCorrectAlternative(
    challenge.correctAnswer,
  );
  const answerAlternatives = ensureFourAlternatives(
    correctAlternative,
    challenge.options,
  );

  const row = {
    challenge_id: challengeId,
    generation_type: generationType,
    image_uuid: imageRefs[0]?.uuid,
    image_file_name: imageRefs[0]?.fileName,
    bucket_path: `${generationType}/${imageRefs[0]?.fileName}`,
    answer_alternatives: answerAlternatives,
    correct_alternative: correctAlternative,
    generation_time_ms: generationTimeMs,
    generation_timestamp: generationTimestamp,
    question: challenge.question,
    generation_specific_metadata: {
      originalChallengeId: challenge.id,
      originalGeneratorId: challenge.generatorId,
      imageCount: challenge.images.length,
      imageRefs,
      metadata: challenge.metadata,
    },
  };

  console.log(`  Inserting row into public.captchas...`);
  const { error: dbError } = await supabase.from("captchas").insert(row);

  if (dbError) {
    throw new Error(`Failed to insert: ${dbError.message}`);
  }

  console.log(
    `  ✅ Done! challenge_id=${challengeId}  (${generationTimeMs}ms)`,
  );
  return row;
}

// --- CLI entry point ---
const typeArg = process.argv[2] || "abutting-grating";
const countArg = parseInt(process.argv[3] || "1", 10);

console.log(
  `\nGenerating ${countArg} captcha(s) of type "${typeArg}" → Supabase\n`,
);

(async () => {
  for (let i = 0; i < countArg; i++) {
    console.log(`[${i + 1}/${countArg}]`);
    await generateAndSync(typeArg);
  }
  console.log("\nAll done!");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
