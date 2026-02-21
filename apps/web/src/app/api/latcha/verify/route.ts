import { NextRequest, NextResponse } from "next/server";
import { consumePending } from "../../../../lib/latcha-pending-store";

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ── Tolerance logic (±1 total error allowed) ──────────────────────────────────

function parseNumericSet(str: string): Set<number> {
  return new Set(
    str
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0),
  );
}

function isAnswerCorrect(
  selectedCells: number[],
  correctAnswer: string,
): boolean {
  const correctSet = parseNumericSet(correctAnswer);
  const submittedSet = new Set(selectedCells.filter((n) => n > 0));

  // Exact match
  if (
    [...correctSet].every((n) => submittedSet.has(n)) &&
    [...submittedSet].every((n) => correctSet.has(n))
  ) {
    return true;
  }

  // ±1 tolerance: count misses + false positives
  let errors = 0;
  for (const n of correctSet) {
    if (!submittedSet.has(n)) errors++;
  }
  for (const n of submittedSet) {
    if (!correctSet.has(n)) errors++;
  }
  return errors <= 1;
}

// ── POST /api/latcha/verify ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      challengeId?: string;
      selectedCells?: number[];
    };

    const { challengeId, selectedCells } = body;

    if (
      !challengeId ||
      !Array.isArray(selectedCells) ||
      selectedCells.length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "Missing challengeId or selectedCells" },
        { status: 400, headers: CORS },
      );
    }

    const pending = consumePending(challengeId);

    if (!pending) {
      return NextResponse.json(
        {
          success: false,
          error: "Challenge not found or expired. Please request a new one.",
        },
        { status: 404, headers: CORS },
      );
    }

    const success = isAnswerCorrect(selectedCells, pending.correctAnswer);

    return NextResponse.json(
      {
        success,
        token: success ? challengeId : undefined,
      },
      { headers: CORS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500, headers: CORS },
    );
  }
}
