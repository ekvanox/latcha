import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
// Load .env from workspace root
dotenv.config({ path: path.join(process.cwd(), "../../.env") });

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const generationsDir = path.join(process.cwd(), "../../generations");
  const dirs = fs
    .readdirSync(generationsDir)
    .filter((f) => fs.statSync(path.join(generationsDir, f)).isDirectory());

  console.log('Ensure bucket "captchas" exists...');
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === "captchas")) {
    console.log('Creating "captchas" bucket...');
    await supabase.storage.createBucket("captchas", { public: true });
  }

  let totalUploaded = 0;

  for (const group of dirs) {
    const metaPath = path.join(generationsDir, group, "metadata.json");
    if (!fs.existsSync(metaPath)) continue;

    console.log(`Processing group: ${group}`);
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));

    const challenges = metadata.challenges;
    const generationType = metadata.generationType || group;

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

      // Upload image to storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from("captchas")
        .upload(bucketPath, fileBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (storageError) {
        console.error(
          `Failed to upload image ${bucketPath}:`,
          storageError.message,
        );
        continue;
      }

      // Insert record to captchas table
      // It's possible the record already exists, so we try an upsert (if primary key/unique key matched. The schema has unique constraint on challenge_id)
      const { error: dbError } = await supabase.from("captchas").upsert(
        {
          challenge_id: challengeId,
          generation_type: generationType,
          image_uuid: imageUuid,
          image_file_name: imageFileName,
          bucket_path: bucketPath,
          answer_alternatives: answerAlternatives,
          correct_alternative: correctAlternative,
          generation_time_ms: generationTimeMs,
          generation_timestamp: generationTimestamp,
          question: question,
          generation_specific_metadata: generationSpecificMetadata,
        },
        { onConflict: "challenge_id" },
      );

      if (dbError) {
        console.error(
          `Failed to insert metadata for ${challengeId}:`,
          dbError.message,
        );
      } else {
        totalUploaded++;
      }
    }
  }

  console.log(`Done! Uploaded ${totalUploaded} captchas.`);
}

main().catch(console.error);
