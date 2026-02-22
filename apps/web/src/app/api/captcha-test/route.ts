import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase";

export interface CaptchaTestItem {
  challengeId: string;
  imageUuid: string;
  generationType: string;
  question: string;
  answerAlternatives: string[];
  correctAlternative: string;
  imageUrl: string;
  format?: "multiple-choice" | "select-all";
  gridImageUrls?: string[];
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";

function bucketImageUrl(bucketPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/captchas/${bucketPath}`;
}

interface ImageRef {
  uuid: string;
  fileName: string;
  mimeType?: string;
}

async function loadChallenges(
  typeFilter?: string,
): Promise<CaptchaTestItem[]> {
  try {
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("captchas")
      .select(
        "challenge_id, image_uuid, generation_type, question, answer_alternatives, correct_alternative, bucket_path, generation_specific_metadata, captcha_types!inner(disabled)",
      )
      .eq("captcha_types.disabled", false)
      .order("generation_timestamp", { ascending: true });

    if (typeFilter) {
      query = query.eq("generation_type", typeFilter);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row) => {
      const metadata = row.generation_specific_metadata as
        | { imageRefs?: ImageRef[] }
        | undefined;
      const imageRefs = metadata?.imageRefs;
      const isGrid = Array.isArray(imageRefs) && imageRefs.length === 9;

      if (isGrid) {
        const gridImageUrls = imageRefs.map((ref: ImageRef) =>
          bucketImageUrl(`${row.generation_type}/${ref.fileName}`),
        );

        return {
          challengeId: row.challenge_id,
          imageUuid: row.image_uuid,
          generationType: row.generation_type,
          question: row.question,
          answerAlternatives: [],
          correctAlternative: row.correct_alternative,
          imageUrl: gridImageUrls[0] ?? "",
          format: "select-all" as const,
          gridImageUrls,
        };
      }

      return {
        challengeId: row.challenge_id,
        imageUuid: row.image_uuid,
        generationType: row.generation_type,
        question: row.question,
        answerAlternatives: row.answer_alternatives,
        correctAlternative: row.correct_alternative,
        imageUrl: bucketImageUrl(row.bucket_path),
        format: "multiple-choice" as const,
      };
    });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const typeFilter = request.nextUrl.searchParams.get("type") ?? undefined;

  try {
    const items = await loadChallenges(typeFilter);

    if (items.length === 0) {
      return NextResponse.json(
        {
          error: typeFilter
            ? `No challenges found for type "${typeFilter}".`
            : "No captcha challenges found.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ items, count: items.length });
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
