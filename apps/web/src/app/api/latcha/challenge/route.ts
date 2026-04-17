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
    grid_image_data_urls?: string[];
    imageRefs?: Array<{
      uuid: string;
      fileName: string;
      mimeType?: string;
    }>;
  };
}

function hasValidGridDataUrls(urls: unknown): urls is string[] {
  return (
    Array.isArray(urls) &&
    urls.length === 9 &&
    urls.every(
      (url) => typeof url === "string" && url.startsWith("data:image/"),
    )
  );
}

async function isResolvableImageUrl(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
    });

    if (head.ok) return true;

    if (head.status === 405 || head.status === 400) {
      const get = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });
      return get.ok;
    }

    return false;
  } catch {
    return false;
  }
}

async function buildGridImageUrls(
  pb: ReturnType<typeof createPocketBaseClient>,
  row: CaptchaRow,
): Promise<string[] | null> {
  const dataUrls = row.generation_specific_metadata?.grid_image_data_urls;
  if (hasValidGridDataUrls(dataUrls)) {
    return dataUrls;
  }

  const imageRefs = row.generation_specific_metadata?.imageRefs;
  if (!imageRefs || imageRefs.length !== 9) return null;

  const baseUrl = getPocketBaseUrl().replace(/\/+$/, "");
  const primaryUrl = row.image ? pb.files.getURL(row, row.image) : null;

  const candidateUrls = imageRefs.map((ref) => {
    // Prefer the canonical attached file URL for the primary image.
    if (primaryUrl && row.image_uuid && ref.uuid === row.image_uuid) {
      return primaryUrl;
    }

    // Best-effort fallback for migrated references (legacy filename).
    // Use collectionId (PocketBase canonical format) and URL-encode the filename.
    return `${baseUrl}/api/files/${row.collectionId}/${row.id}/${encodeURIComponent(ref.fileName)}`;
  });

  for (const url of candidateUrls) {
    if (!(await isResolvableImageUrl(url))) {
      return null;
    }
  }

  return candidateUrls;
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
    const data = await pb.collection("captchas").getList(1, 100, {
      sort: "-generation_timestamp",
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

    const candidates = data.items as unknown as CaptchaRow[];
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }

    const prioritizedCandidates = [
      ...candidates.filter((candidate) =>
        hasValidGridDataUrls(
          candidate.generation_specific_metadata?.grid_image_data_urls,
        ),
      ),
      ...candidates
        .filter(
          (candidate) =>
            !hasValidGridDataUrls(
              candidate.generation_specific_metadata?.grid_image_data_urls,
            ),
        )
        .slice(0, 3),
    ];

    let selectedRow: CaptchaRow | null = null;
    let gridImageUrls: string[] | null = null;

    for (const candidate of prioritizedCandidates) {
      const resolvedUrls = await buildGridImageUrls(pb, candidate);
      if (resolvedUrls) {
        selectedRow = candidate;
        gridImageUrls = resolvedUrls;
        break;
      }
    }

    if (!selectedRow || !gridImageUrls) {
      return NextResponse.json(
        {
          error:
            "No usable illusion-faces challenges available (missing accessible 9-cell images).",
        },
        { status: 503, headers: CORS },
      );
    }

    // Store the answer server-side so the client never sees it
    storePending(selectedRow.challenge_id, selectedRow.correct_alternative);

    return NextResponse.json(
      {
        challengeId: selectedRow.challenge_id,
        question: selectedRow.question,
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
