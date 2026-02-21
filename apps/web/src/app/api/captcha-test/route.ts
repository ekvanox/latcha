import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase";

export interface CaptchaTestItem {
  challengeId: string;
  imageUuid: string;
  generationType: string;
  question: string;
  answerAlternatives: string[];
  correctAlternative: string;
  imageUrl: string;
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";

function bucketImageUrl(bucketPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/captchas/${bucketPath}`;
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("captchas")
      .select(
        "challenge_id, image_uuid, generation_type, question, answer_alternatives, correct_alternative, bucket_path",
      )
      .order("generation_timestamp", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch captchas: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "No captcha challenges found. Generate some first." },
        { status: 404 },
      );
    }

    const testItems: CaptchaTestItem[] = data.map((row) => ({
      challengeId: row.challenge_id,
      imageUuid: row.image_uuid,
      generationType: row.generation_type,
      question: row.question,
      answerAlternatives: row.answer_alternatives,
      correctAlternative: row.correct_alternative,
      imageUrl: bucketImageUrl(row.bucket_path),
    }));

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

    // Insert results
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
