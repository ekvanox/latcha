import PocketBase from "pocketbase";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import dotenv from "dotenv";

import { buildChallenge } from "../packages/core/src/challenge/builder";

// Load .env from repo root
const repoRoot = resolve(process.cwd());
dotenv.config({ path: resolve(repoRoot, ".env") });

const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  process.env.POCKETBASE_URL ||
  "https://latcha-db.heimdal.dev";
const POCKETBASE_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const POCKETBASE_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
  console.error(
    "Missing PocketBase admin env vars in .env file (POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD)",
  );
  process.exit(1);
}

let pbClient: PocketBase | null = null;

async function getPocketBaseAdminClient(): Promise<PocketBase> {
  if (pbClient) return pbClient;

  const pb = new PocketBase(POCKETBASE_URL);
  await pb.admins.authWithPassword(
    POCKETBASE_ADMIN_EMAIL!,
    POCKETBASE_ADMIN_PASSWORD!,
  );

  pbClient = pb;
  return pb;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 404
  );
}

function toDisplayName(legacyId: string): string {
  return legacyId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function ensureCaptchaTypeId(
  pb: PocketBase,
  generationType: string,
): Promise<string | undefined> {
  try {
    const existing = await pb
      .collection("captcha_types")
      .getFirstListItem(pb.filter("legacy_id = {:legacyId}", { legacyId: generationType }));

    return existing.id;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const created = await pb.collection("captcha_types").create({
    legacy_id: generationType,
    display_name: toDisplayName(generationType),
    description: "",
    disabled: false,
  });

  return created.id;
}

// Helpers
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

  const pb = await getPocketBaseAdminClient();

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
  const gridImageDataUrls = challenge.images.map(
    (image) =>
      `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`,
  );

  const primaryImage = challenge.images[0]!;
  const primaryImageRef = imageRefs[0]!;
  const imageFile = new File([primaryImage.data], primaryImageRef.fileName, {
    type: primaryImage.mimeType,
  });
  const captchaTypeId = await ensureCaptchaTypeId(pb, generationType);

  const row = {
    challenge_id: challengeId,
    legacy_id: challenge.id,
    generation_type: generationType,
    ...(captchaTypeId ? { captcha_type: captchaTypeId } : {}),
    image_uuid: primaryImageRef.uuid,
    image_file_name: primaryImageRef.fileName,
    bucket_path: `${generationType}/${primaryImageRef.fileName}`,
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
      grid_image_data_urls: gridImageDataUrls,
      metadata: challenge.metadata,
    },
    image: imageFile,
  };

  console.log(`  Creating record in PocketBase captchas...`);
  await pb.collection("captchas").create(row);

  console.log(
    `  ✅ Done! challenge_id=${challengeId}  (${generationTimeMs}ms)`,
  );
  return row;
}

// --- CLI entry point ---
const typeArg = process.argv[2] || "abutting-grating";
const countArg = parseInt(process.argv[3] || "1", 10);

console.log(
  `\nGenerating ${countArg} captcha(s) of type "${typeArg}" → PocketBase\n`,
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
