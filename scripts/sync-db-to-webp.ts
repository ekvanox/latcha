/**
 * Patches the Supabase `captchas` table so that every row's
 * bucket_path / image_file_name / imageRefs reflect the already-converted
 * WebP files that are already in the bucket.
 *
 * Run AFTER the images have already been converted in the bucket.
 *
 * Usage:
 *   npx tsx scripts/sync-db-to-webp.ts              # all types
 *   npx tsx scripts/sync-db-to-webp.ts illusion-faces  # one type
 *   npx tsx scripts/sync-db-to-webp.ts --dry-run    # preview only
 */

import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_WIDTH = 256;
const TARGET_HEIGHT = 256;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toWebPFileName(fileName: string): string {
  return fileName.replace(/\.(png|gif|jpe?g)$/i, ".webp");
}

function needsUpdate(fileName: string): boolean {
  return /\.(png|gif|jpe?g)$/i.test(fileName);
}

// ── Per-record patch ──────────────────────────────────────────────────────────

function buildUpdates(
  record: CaptchaRecord,
): Record<string, unknown> | null {
  const { generation_type } = record;
  const meta = record.generation_specific_metadata;
  const imageRefs: ImageRef[] = meta?.imageRefs ?? [];

  const updates: Record<string, unknown> = {};

  // ── Top-level image_file_name + bucket_path ───────────────────────────────
  if (needsUpdate(record.image_file_name)) {
    updates.image_file_name = toWebPFileName(record.image_file_name);
    updates.bucket_path = `${generation_type}/${updates.image_file_name}`;
  }

  // ── imageRefs inside generation_specific_metadata ────────────────────────
  if (imageRefs.length > 0) {
    const updatedRefs: ImageRef[] = imageRefs.map((ref) => {
      if (!needsUpdate(ref.fileName)) return ref;
      return {
        ...ref,
        fileName: toWebPFileName(ref.fileName),
        mimeType: "image/webp",
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
      };
    });

    const anyRefChanged = updatedRefs.some(
      (ref, i) => ref.fileName !== imageRefs[i]!.fileName,
    );

    if (anyRefChanged) {
      updates.generation_specific_metadata = { ...meta, imageRefs: updatedRefs };
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🗄️  Syncing DB records to point at WebP files");
  if (dryRun) console.log("   DRY RUN — no writes will happen\n");
  if (typeFilter) console.log(`   Filtering to type: ${typeFilter}\n`);

  let totalScanned = 0;
  let totalPatched = 0;
  let page = 0;

  while (true) {
    let query = supabase
      .from("captchas")
      .select(
        "id, challenge_id, generation_type, image_uuid, image_file_name, bucket_path, generation_specific_metadata",
      )
      .order("generation_timestamp", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (typeFilter) query = query.eq("generation_type", typeFilter);

    const { data, error } = await query;
    if (error) {
      console.error("DB query error:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const record of data as CaptchaRecord[]) {
      totalScanned++;
      const updates = buildUpdates(record);

      if (!updates) {
        console.log(`  skip  [${record.generation_type}] ${record.challenge_id} (already up to date)`);
        continue;
      }

      console.log(`  patch [${record.generation_type}] ${record.challenge_id}`);
      if (updates.bucket_path) {
        console.log(`        bucket_path: ${record.bucket_path}  →  ${updates.bucket_path}`);
      }

      if (dryRun) {
        totalPatched++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("captchas")
        .update(updates)
        .eq("id", record.id);

      if (updateError) {
        console.error(`        ✗ DB update failed: ${updateError.message}`);
      } else {
        totalPatched++;
      }
    }

    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(
    `\n✅  Done. Scanned ${totalScanned} records, patched ${totalPatched}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
