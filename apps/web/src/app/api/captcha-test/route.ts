import { NextResponse } from "next/server";
import { listGenerationVisualizations } from "../../../lib/generations";

export interface CaptchaTestItem {
  challengeId: string;
  imageUuid: string;
  generationType: string;
  question: string;
  answerAlternatives: string[];
  correctAlternative: string;
  imageUrl: string;
}

export async function GET() {
  try {
    const items = await listGenerationVisualizations(10_000);
    const testItems: CaptchaTestItem[] = items.map((item) => ({
      challengeId: item.challengeId,
      imageUuid: item.imageUuid,
      generationType: item.generationType,
      question: item.question,
      answerAlternatives: item.answerAlternatives,
      correctAlternative: item.correctAlternative,
      imageUrl: `/api/generations/image/${item.generationType}/${item.imageUuid}`,
    }));

    return NextResponse.json({ items: testItems, count: testItems.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { createSupabaseServerClient } from "../../../lib/supabase";

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
      const resultsToInsert = results.map((r: any) => ({
        session_id: sessionId,
        captcha_id: r.captchaId,
        answer_time_ms: r.answerTimeMs,
        response: r.response,
        is_correct: r.isCorrect,
      }));

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
