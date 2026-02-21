/**
 * Resets image_file_name, bucket_path, and imageRefs[].fileName back to .png
 * for every generation_type that is NOT "illusion-faces".
 *
 * Run this to fix the DB after sync-db-to-webp incorrectly set all types to .webp.
 *
 * Usage:
 *   npx tsx scripts/reset-non-illusion-to-png.ts
 *   npx tsx scripts/reset-non-illusion-to-png.ts --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const PAGE_SIZE = 50;
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

interface ImageRef {
  uuid: string;
  fileName: string;
  mimeType?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

interface CaptchaRecord {
  id: string;
  challenge_id: string;
  generation_type: string;
  image_uuid: string;
  image_file_name: string;
  bucket_path: string;
  generation_specific_metadata: {
    imageRefs?: ImageRef[];
    [key: string]: unknown;
  } | null;
}

function toPng(fileName: string): string {
  return fileName.replace(/\.webp$/i, ".png");
}

async function main() {
  console.log("\n🔧  Resetting non-illusion-faces records back to .png");
  if (dryRun) console.log("   DRY RUN\n");

  let totalScanned = 0;
  let totalFixed = 0;
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from("captchas")
      .select(
        "id, challenge_id, generation_type, image_uuid, image_file_name, bucket_path, generation_specific_metadata",
      )
      .neq("generation_type", "illusion-faces")
      .order("generation_timestamp", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) { console.error("DB error:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const record of data as CaptchaRecord[]) {
      totalScanned++;

      const updates: Record<string, unknown> = {};
      const meta = record.generation_specific_metadata;
      const imageRefs: ImageRef[] = meta?.imageRefs ?? [];

      // Fix top-level fields if they incorrectly say .webp
      if (record.image_file_name.endsWith(".webp")) {
        updates.image_file_name = toPng(record.image_file_name);
        updates.bucket_path = toPng(record.bucket_path);
      }

      // Fix imageRefs in metadata
      if (imageRefs.length > 0) {
        const fixedRefs = imageRefs.map((ref) =>
          ref.fileName.endsWith(".webp")
            ? { ...ref, fileName: toPng(ref.fileName), mimeType: "image/png", width: undefined, height: undefined }
            : ref,
        );
        const anyChanged = fixedRefs.some((r, i) => r.fileName !== imageRefs[i]!.fileName);
        if (anyChanged) {
          updates.generation_specific_metadata = { ...meta, imageRefs: fixedRefs };
        }
      }

      if (Object.keys(updates).length === 0) {
        console.log(`  skip  [${record.generation_type}] ${record.challenge_id} (already .png)`);
        continue;
      }

      console.log(`  fix   [${record.generation_type}] ${record.challenge_id}`);
      console.log(`        ${record.image_file_name}  →  ${updates.image_file_name ?? record.image_file_name}`);

      if (dryRun) { totalFixed++; continue; }

      const { error: updateError } = await supabase
        .from("captchas")
        .update(updates)
        .eq("id", record.id);

      if (updateError) {
        console.error(`        ✗ ${updateError.message}`);
      } else {
        totalFixed++;
      }
    }

    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`\n✅  Done. Scanned ${totalScanned}, fixed ${totalFixed}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
