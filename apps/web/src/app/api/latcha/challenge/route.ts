import { NextResponse } from "next/server";
import {
  createPocketBaseClient,
  getPocketBaseUrl,
} from "../../../../lib/pocketbase";
import { storePending } from "../../../../lib/latcha-pending-store";

// ── PocketBase row type ───────────────────────────────────────────────────────

interface CaptchaRow {
  id: string;
  collectionId: string;
  collectionName: string;
  challenge_id: string;
  question: string;
  correct_alternative: string;
  image?: string;
  image_uuid?: string;
  generation_specific_metadata?: {
    imageRefs?: Array<{
      uuid: string;
      fileName: string;
      mimeType?: string;
    }>;
  };
}

function buildGridImageUrls(pb: ReturnType<typeof createPocketBaseClient>, row: CaptchaRow): string[] | null {
  const imageRefs = row.generation_specific_metadata?.imageRefs;
  if (!imageRefs || imageRefs.length !== 9) return null;

  const baseUrl = getPocketBaseUrl().replace(/\/+$/, "");
  const primaryUrl = row.image ? pb.files.getURL(row, row.image) : null;

  return imageRefs.map((ref) => {
    // Prefer the canonical attached file URL for the primary image.
    if (primaryUrl && row.image_uuid && ref.uuid === row.image_uuid) {
      return primaryUrl;
    }

    // Best-effort fallback for migrated references (legacy filename).
    return `${baseUrl}/api/files/${row.collectionName}/${row.id}/${ref.fileName}`;
  });
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
    const pb = createPocketBaseClient();

    // Pick a random illusion-faces challenge.
    // We fetch a small batch and pick one at random to avoid the overhead
    // of COUNT(*) + OFFSET (which is slow on large tables).
    const data = await pb.collection("captchas").getList(1, 50, {
      filter: pb.filter("generation_type = {:generationType}", {
        generationType: "illusion-faces",
      }),
    });

    if (!data.items || data.items.length === 0) {
      return NextResponse.json(
        { error: "No illusion-faces challenges available." },
        { status: 404, headers: CORS },
      );
    }

    const row = data.items[
      Math.floor(Math.random() * data.items.length)
    ] as unknown as CaptchaRow;

    const gridImageUrls = buildGridImageUrls(pb, row);
    if (!gridImageUrls) {
      return NextResponse.json(
        { error: "Challenge data is malformed (expected 9 image refs)." },
        { status: 500, headers: CORS },
      );
    }

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
