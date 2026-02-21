import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase";
import { storePending } from "../../../../lib/latcha-pending-store";

// ── Supabase row type ─────────────────────────────────────────────────────────

interface CaptchaRow {
  challenge_id: string;
  question: string;
  correct_alternative: string;
  generation_specific_metadata: {
    imageRefs?: Array<{
      uuid: string;
      fileName: string;
      mimeType?: string;
    }>;
  };
}

// ── CORS headers (allows cross-origin use from any domain) ────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ── GET /api/latcha/challenge ──────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";

    // Pick a random illusion-faces challenge.
    // We fetch a small batch and pick one at random to avoid the overhead
    // of COUNT(*) + OFFSET (which is slow on large tables).
    const { data, error } = await supabase
      .from("captchas")
      .select(
        "challenge_id, question, correct_alternative, generation_specific_metadata",
      )
      .eq("generation_type", "illusion-faces")
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500, headers: CORS },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "No illusion-faces challenges available." },
        { status: 404, headers: CORS },
      );
    }

    const row = data[
      Math.floor(Math.random() * data.length)
    ] as CaptchaRow;

    const imageRefs = row.generation_specific_metadata?.imageRefs;
    if (!imageRefs || imageRefs.length !== 9) {
      return NextResponse.json(
        { error: "Challenge data is malformed (expected 9 image refs)." },
        { status: 500, headers: CORS },
      );
    }

    // Build public storage URLs for each of the 9 cells
    const gridImageUrls = imageRefs.map(
      (ref) =>
        `${supabaseUrl}/storage/v1/object/public/captchas/illusion-faces/${ref.uuid}.png`,
    );

    // Store the answer server-side so the client never sees it
    storePending(row.challenge_id, row.correct_alternative);

    return NextResponse.json(
      {
        challengeId: row.challenge_id,
        question: row.question,
        gridImageUrls,
      },
      { headers: CORS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: CORS },
    );
  }
}
