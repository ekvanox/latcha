import PocketBase from "pocketbase";
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
// Load .env from workspace root
dotenv.config({ path: path.join(process.cwd(), "../../.env") });

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

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  return "image/png";
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
    if (!isNotFoundError(error)) throw error;
  }

  const created = await pb.collection("captcha_types").create({
    legacy_id: generationType,
    display_name: toDisplayName(generationType),
    description: "",
    disabled: false,
  });

  return created.id;
}

async function main() {
  const pb = await getPocketBaseAdminClient();
  const generationsDir = path.join(process.cwd(), "../../generations");
  const dirs = fs
    .readdirSync(generationsDir)
    .filter((f) => fs.statSync(path.join(generationsDir, f)).isDirectory());

  let totalUploaded = 0;

  for (const group of dirs) {
    const metaPath = path.join(generationsDir, group, "metadata.json");
    if (!fs.existsSync(metaPath)) continue;

    console.log(`Processing group: ${group}`);
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));

    const challenges = metadata.challenges;
    const generationType = metadata.generationType || group;
    const captchaTypeId = await ensureCaptchaTypeId(pb, generationType);

    for (const challenge of challenges) {
      const {
        challengeId,
        imageUuid,
        imageFileName,
        answerAlternatives,
        correctAlternative,
        generationTimeMs,
        generationTimestamp,
        question,
        generationSpecificMetadata,
      } = challenge;

      const imagePath = path.join(
        generationsDir,
        group,
        "challenge",
        imageFileName,
      );
      if (!fs.existsSync(imagePath)) {
        console.warn(`Image missing: ${imagePath}`);
        continue;
      }

      const fileBuffer = fs.readFileSync(imagePath);
      const bucketPath = `${generationType}/${imageFileName}`;
      const imageFile = new File([fileBuffer], imageFileName, {
        type: mimeFromFilename(imageFileName),
      });

      const payload = {
        challenge_id: challengeId,
        generation_type: generationType,
        ...(captchaTypeId ? { captcha_type: captchaTypeId } : {}),
        image_uuid: imageUuid,
        image_file_name: imageFileName,
        bucket_path: bucketPath,
        answer_alternatives: answerAlternatives,
        correct_alternative: correctAlternative,
        generation_time_ms: generationTimeMs,
        generation_timestamp: generationTimestamp,
        question,
        generation_specific_metadata: generationSpecificMetadata,
        image: imageFile,
      };

      try {
        try {
          const existing = await pb
            .collection("captchas")
            .getFirstListItem(
              pb.filter("challenge_id = {:challengeId}", { challengeId }),
            );
          await pb.collection("captchas").update(existing.id, payload);
        } catch (error) {
          if (!isNotFoundError(error)) throw error;
          await pb.collection("captchas").create(payload);
        }

        totalUploaded++;
      } catch (error) {
        console.error(
          `Failed to upsert metadata for ${challengeId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  console.log(`Done! Uploaded ${totalUploaded} captchas.`);
}

main().catch(console.error);
