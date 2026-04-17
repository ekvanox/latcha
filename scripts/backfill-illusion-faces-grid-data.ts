import PocketBase from "pocketbase";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import dotenv from "dotenv";

import { buildChallenge } from "../packages/core/src/challenge/builder";

const repoRoot = resolve(process.cwd());
dotenv.config({ path: resolve(repoRoot, ".env") });

const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  process.env.POCKETBASE_URL ||
  "https://latcha-db.heimdal.dev";
const POCKETBASE_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const POCKETBASE_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
  throw new Error(
    "Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env",
  );
}

if (!process.env.FAL_KEY) {
  throw new Error(
    "Missing FAL_KEY in .env (required to regenerate illusion-faces challenges).",
  );
}

interface CaptchaRecord {
  id: string;
  challenge_id: string;
  generation_specific_metadata?: {
    grid_image_data_urls?: string[];
  };
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || !error || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

async function authenticatePocketBaseAdmin(pb: PocketBase): Promise<void> {
  try {
    await pb.admins.authWithPassword(
      POCKETBASE_ADMIN_EMAIL!,
      POCKETBASE_ADMIN_PASSWORD!,
    );
    return;
  } catch (error) {
    // Older PocketBase deployments may expose /api/admins/auth-with-password
    // instead of /api/collections/_superusers/auth-with-password.
    if (getErrorStatus(error) !== 404) {
      throw error;
    }
  }

  const authUrl = `${POCKETBASE_URL.replace(/\/+$/, "")}/api/admins/auth-with-password`;
  const response = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity: POCKETBASE_ADMIN_EMAIL,
      password: POCKETBASE_ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `PocketBase admin auth failed (${response.status}): ${body}`,
    );
  }

  const authData = (await response.json()) as {
    token?: string;
    admin?: Record<string, unknown>;
    record?: Record<string, unknown>;
  };

  if (!authData.token) {
    throw new Error("PocketBase admin auth response did not include token.");
  }

  pb.authStore.save(
    authData.token,
    (authData.admin ?? authData.record ?? null) as Record<string, unknown> | null,
  );
}

function parseArgs(args: string[]) {
  let limit = 25;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--limit" || args[i] === "-n") && args[i + 1]) {
      limit = Math.max(1, parseInt(args[++i]!, 10));
    }
    if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { limit, dryRun };
}

function hasValidGridDataUrls(urls: unknown): urls is string[] {
  return (
    Array.isArray(urls) &&
    urls.length === 9 &&
    urls.every(
      (url) => typeof url === "string" && url.startsWith("data:image/"),
    )
  );
}

function mimeToExtension(mimeType: string): string {
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/jpeg") return ".jpg";
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

async function main() {
  const { limit, dryRun } = parseArgs(process.argv.slice(2));

  const pb = new PocketBase(POCKETBASE_URL);
  await authenticatePocketBaseAdmin(pb);

  const records = await pb.collection("captchas").getFullList<CaptchaRecord>({
    sort: "-generation_timestamp",
    filter: pb.filter("generation_type = {:generationType}", {
      generationType: "illusion-faces",
    }),
  });

  const targets = records
    .filter(
      (record) =>
        !hasValidGridDataUrls(
          record.generation_specific_metadata?.grid_image_data_urls,
        ),
    )
    .slice(0, limit);

  if (!targets.length) {
    console.log("No illusion-faces records need backfill. ✅");
    return;
  }

  console.log(
    `Found ${targets.length} illusion-faces records requiring 9-cell grid backfill${dryRun ? " (dry-run)" : ""}.`,
  );

  let updated = 0;
  let failed = 0;

  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]!;
    process.stdout.write(
      `[${index + 1}/${targets.length}] Backfilling record ${target.id} (${target.challenge_id})... `,
    );

    try {
      const started = Date.now();
      const challenge = await buildChallenge("illusion-faces");
      const generationTimeMs = Date.now() - started;

      if (!challenge.images.length) {
        throw new Error("Generated challenge has no images.");
      }

      const imageRefs: Array<{
        uuid: string;
        fileName: string;
        mimeType: string;
        width: number;
        height: number;
      }> = [];

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

      const primaryImage = challenge.images[0]!;
      const primaryImageRef = imageRefs[0]!;
      const correctAlternative = normalizeCorrectAlternative(
        challenge.correctAnswer,
      );
      const answerAlternatives = ensureFourAlternatives(
        correctAlternative,
        challenge.options,
      );

      const payload = {
        question: challenge.question,
        answer_alternatives: answerAlternatives,
        correct_alternative: correctAlternative,
        generation_time_ms: generationTimeMs,
        generation_timestamp: new Date().toISOString(),
        image_uuid: primaryImageRef.uuid,
        image_file_name: primaryImageRef.fileName,
        bucket_path: `illusion-faces/${primaryImageRef.fileName}`,
        generation_specific_metadata: {
          originalChallengeId: challenge.id,
          originalGeneratorId: challenge.generatorId,
          imageCount: challenge.images.length,
          imageRefs,
          grid_image_data_urls: challenge.images.map(
            (image) =>
              `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`,
          ),
          metadata: challenge.metadata,
        },
        image: new File([primaryImage.data], primaryImageRef.fileName, {
          type: primaryImage.mimeType,
        }),
      };

      if (!dryRun) {
        await pb.collection("captchas").update(target.id, payload);
      }

      updated++;
      process.stdout.write("done\n");
    } catch (error) {
      failed++;
      process.stdout.write(
        `failed (${error instanceof Error ? error.message : String(error)})\n`,
      );
    }
  }

  console.log(
    `\nBackfill complete: ${updated} updated, ${failed} failed.${dryRun ? " (dry-run mode)" : ""}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
