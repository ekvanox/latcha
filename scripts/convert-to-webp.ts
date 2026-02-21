/**
 * Converts all captcha images in Supabase to WebP at 256×256px.
 *
 * Usage:
 *   npx tsx scripts/convert-to-webp.ts              # migrate all types
 *   npx tsx scripts/convert-to-webp.ts illusion-faces  # one type only
 *   npx tsx scripts/convert-to-webp.ts --dry-run    # preview only
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_SIZE = 256;
const WEBP_QUALITY = 85;
const PAGE_SIZE = 50;

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const typeFilter = args.find((a) => !a.startsWith("--")) ?? null;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImageRef {
  uuid: string;
  fileName: string;
  mimeType?: string;
  width?: number;
  height?: number;
  role?: string;
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
    imageCount?: number;
    [key: string]: unknown;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function downloadImage(bucketPath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from("captchas")
    .download(bucketPath);
  if (error || !data) {
    throw new Error(`Download failed for ${bucketPath}: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

async function convertToWebP(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: "cover", position: "centre" })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

async function uploadImage(bucketPath: string, buffer: Buffer): Promise<void> {
  const { error } = await supabase.storage
    .from("captchas")
    .upload(bucketPath, buffer, { contentType: "image/webp", upsert: true });
  if (error) {
    throw new Error(`Upload failed for ${bucketPath}: ${error.message}`);
  }
}

async function deleteImage(bucketPath: string): Promise<void> {
  const { error } = await supabase.storage
    .from("captchas")
    .remove([bucketPath]);
  if (error) {
    console.warn(`  ⚠  Could not delete old file ${bucketPath}: ${error.message}`);
  }
}

// ── Per-record migration ───────────────────────────────────────────────────────

async function migrateRecord(record: CaptchaRecord): Promise<boolean> {
  const { generation_type } = record;
  const meta = record.generation_specific_metadata;
  const imageRefs: ImageRef[] = meta?.imageRefs ?? [];

  // Build a unified list of refs to process.
  // For single-image challenges imageRefs may be empty — synthesise one entry.
  const refsToProcess: ImageRef[] =
    imageRefs.length > 0
      ? imageRefs
      : [
          {
            uuid: record.image_uuid,
            fileName: record.image_file_name,
            mimeType: "image/png",
          },
        ];

  let anyChanged = false;
  const updatedRefs: ImageRef[] = [];

  for (const ref of refsToProcess) {
    const oldFileName = ref.fileName;

    // Already WebP → skip
    if (oldFileName.toLowerCase().endsWith(".webp")) {
      console.log(`    skip  ${oldFileName} (already WebP)`);
      updatedRefs.push(ref);
      continue;
    }

    const oldBucketPath = `${generation_type}/${oldFileName}`;
    const newFileName = `${ref.uuid}.webp`;
    const newBucketPath = `${generation_type}/${newFileName}`;

    console.log(`    convert  ${oldFileName}  →  ${newFileName}`);

    if (dryRun) {
      updatedRefs.push({ ...ref, fileName: newFileName, mimeType: "image/webp", width: TARGET_SIZE, height: TARGET_SIZE });
      anyChanged = true;
      continue;
    }

    try {
      const raw = await downloadImage(oldBucketPath);
      const webp = await convertToWebP(raw);
      await uploadImage(newBucketPath, webp);
      await deleteImage(oldBucketPath);

      updatedRefs.push({
        ...ref,
        fileName: newFileName,
        mimeType: "image/webp",
        width: TARGET_SIZE,
        height: TARGET_SIZE,
      });
      anyChanged = true;
    } catch (err) {
      console.error(`    ✗  ${(err as Error).message}`);
      updatedRefs.push(ref); // keep original on failure
    }
  }

  if (!anyChanged) return false;
  if (dryRun) {
    console.log(`    [dry-run] would update DB record ${record.challenge_id}`);
    return true;
  }

  // Build DB update payload
  const firstUpdated = updatedRefs[0];
  const updates: Record<string, unknown> = {};

  // Always sync top-level image fields if the first ref was converted
  if (firstUpdated && firstUpdated.fileName !== record.image_file_name) {
    updates.image_file_name = firstUpdated.fileName;
    updates.bucket_path = `${generation_type}/${firstUpdated.fileName}`;
  }

  // Update imageRefs in metadata (only if they existed originally)
  if (imageRefs.length > 0) {
    updates.generation_specific_metadata = { ...meta, imageRefs: updatedRefs };
  }

  if (Object.keys(updates).length === 0) return false;

  const { error } = await supabase
    .from("captchas")
    .update(updates)
    .eq("id", record.id);

  if (error) {
    console.error(`    ✗  DB update failed: ${error.message}`);
    return false;
  }

  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔄  Converting captcha images to WebP (${TARGET_SIZE}×${TARGET_SIZE}px)`);
  if (dryRun) console.log("   DRY RUN — no changes will be made\n");
  if (typeFilter) console.log(`   Filtering to type: ${typeFilter}\n`);

  let totalProcessed = 0;
  let totalConverted = 0;
  let page = 0;

  while (true) {
    let query = supabase
      .from("captchas")
      .select("id, challenge_id, generation_type, image_uuid, image_file_name, bucket_path, generation_specific_metadata")
      .order("generation_timestamp", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (typeFilter) {
      query = query.eq("generation_type", typeFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("DB query error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    for (const record of data as CaptchaRecord[]) {
      console.log(`\n[${record.generation_type}] ${record.challenge_id}`);
      const changed = await migrateRecord(record);
      totalProcessed++;
      if (changed) totalConverted++;
    }

    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`\n✅  Done. Processed ${totalProcessed} records, converted ${totalConverted}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
