import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase";
import { resolveGenerationsDir } from "../../../lib/generations";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface CaptchaTestItem {
  challengeId: string;
  imageUuid: string;
  generationType: string;
  question: string;
  answerAlternatives: string[];
  correctAlternative: string;
  imageUrl: string;
  format?: "multiple-choice" | "select-all";
  // For select-all grid challenges: URLs for all 9 cells
  gridImageUrls?: string[];
}

// ── Local generations loader ───────────────────────────────────────────────────

interface StoredImageRef {
  uuid: string;
  fileName: string;
  mimeType?: string;
}

interface StoredEntry {
  challengeId: string;
  imageUuid: string;
  imageFileName: string;
  answerAlternatives: string[];
  correctAlternative: string;
  generationTimestamp: string;
  question: string;
  generationSpecificMetadata?: {
    imageRefs?: StoredImageRef[];
    [key: string]: unknown;
  };
}

interface StoredMetadata {
  generationType: string;
  challenges: StoredEntry[];
}

function localImageUrl(generationType: string, imageUuid: string): string {
  return `/api/generations/image/${generationType}/${imageUuid}`;
}

async function loadLocalChallenges(
  typeFilter?: string,
): Promise<CaptchaTestItem[]> {
  let generationsDir: string;
  try {
    generationsDir = resolveGenerationsDir();
  } catch {
    return [];
  }

  // Determine which types to load
  let types: string[];
  if (typeFilter) {
    types = [typeFilter];
  } else {
    try {
      const entries = await readdir(generationsDir, { withFileTypes: true });
      types = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name);
    } catch {
      return [];
    }
  }

  const items: CaptchaTestItem[] = [];

  for (const generationType of types) {
    const metadataPath = resolve(generationsDir, generationType, "metadata.json");
    if (!existsSync(metadataPath)) continue;

    let metadata: StoredMetadata;
    try {
      const raw = await readFile(metadataPath, "utf8");
      metadata = JSON.parse(raw) as StoredMetadata;
      if (!metadata?.challenges?.length) continue;
    } catch {
      continue;
    }

    for (const entry of metadata.challenges) {
      if (!entry.correctAlternative) continue;

      const imageRefs = entry.generationSpecificMetadata?.imageRefs;
      const isGrid = Array.isArray(imageRefs) && imageRefs.length === 9;

      if (isGrid) {
        // select-all grid challenge: serve each cell via the image API
        const gridImageUrls = (imageRefs as StoredImageRef[]).map((ref) =>
          localImageUrl(generationType, ref.uuid),
        );

        items.push({
          challengeId: entry.challengeId,
          imageUuid: entry.imageUuid,
          generationType,
          question: entry.question,
          answerAlternatives: [],
          correctAlternative: entry.correctAlternative,
          imageUrl: gridImageUrls[0] ?? "",
          format: "select-all",
          gridImageUrls,
        });
      } else {
        // Standard multiple-choice challenge
        if (
          !entry.imageUuid ||
          !entry.imageFileName ||
          !Array.isArray(entry.answerAlternatives) ||
          entry.answerAlternatives.length < 2
        ) {
          continue;
        }

        items.push({
          challengeId: entry.challengeId,
          imageUuid: entry.imageUuid,
          generationType,
          question: entry.question,
          answerAlternatives: entry.answerAlternatives,
          correctAlternative: entry.correctAlternative,
          imageUrl: localImageUrl(generationType, entry.imageUuid),
          format: "multiple-choice",
        });
      }
    }
  }

  return items;
}

// ── Supabase loader (fallback / supplement for types not in local generations) ─

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";

function bucketImageUrl(bucketPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/captchas/${bucketPath}`;
}

async function loadSupabaseChallenges(
  localTypes: Set<string>,
  typeFilter?: string,
): Promise<CaptchaTestItem[]> {
  try {
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("captchas")
      .select(
        "challenge_id, image_uuid, generation_type, question, answer_alternatives, correct_alternative, bucket_path, captcha_types!inner(disabled)",
      )
      .eq("captcha_types.disabled", false)
      .order("generation_timestamp", { ascending: true });

    if (typeFilter) {
      query = query.eq("generation_type", typeFilter);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data
      .filter(
        (row) =>
          // Skip types we already have locally (prefer local)
          !localTypes.has(row.generation_type),
      )
      .map((row) => ({
        challengeId: row.challenge_id,
        imageUuid: row.image_uuid,
        generationType: row.generation_type,
        question: row.question,
        answerAlternatives: row.answer_alternatives,
        correctAlternative: row.correct_alternative,
        imageUrl: bucketImageUrl(row.bucket_path),
        format: "multiple-choice" as const,
      }));
  } catch {
    return [];
  }
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const typeFilter = request.nextUrl.searchParams.get("type") ?? undefined;

  try {
    const localItems = await loadLocalChallenges(typeFilter);
    const localTypes = new Set(localItems.map((i) => i.generationType));

    const supabaseItems = await loadSupabaseChallenges(localTypes, typeFilter);

    const testItems: CaptchaTestItem[] = [...localItems, ...supabaseItems];

    if (testItems.length === 0) {
      return NextResponse.json(
        {
          error: typeFilter
            ? `No challenges found for type "${typeFilter}". Generate some with pnpm pregenerate.`
            : "No captcha challenges found. Generate some first.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ items: testItems, count: testItems.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session, results } = body;

    if (!session || !results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();

    // Insert session
    const { data: sessionData, error: sessionError } = await supabase
      .from("eval_sessions")
      .insert({
        user_agent: session.userAgent || "unknown",
        device_type: session.deviceType || "unknown",
        total_session_time_ms: session.totalSessionTimeMs,
      })
      .select("id")
      .single();

    if (sessionError || !sessionData) {
      throw new Error(
        `Failed to insert session: ${sessionError?.message || "Unknown error"}`,
      );
    }

    const sessionId = sessionData.id;

    if (results.length > 0) {
      const resultsToInsert = results.map(
        (r: {
          captchaId: string;
          answerTimeMs: number;
          response: string;
          isCorrect: boolean;
        }) => ({
          session_id: sessionId,
          captcha_id: r.captchaId,
          answer_time_ms: r.answerTimeMs,
          response: r.response,
          is_correct: r.isCorrect,
        }),
      );

      const { error: resultsError } = await supabase
        .from("eval_results")
        .insert(resultsToInsert);

      if (resultsError) {
        throw new Error(`Failed to insert results: ${resultsError.message}`);
      }
    }

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
