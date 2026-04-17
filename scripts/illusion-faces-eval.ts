/**
 * illusion-faces-eval.ts
 *
 * Evaluates frontier LLMs on the illusion-faces 3×3 grid CAPTCHA.
 * Each challenge sends 9 grid images to the model; it must identify
 * all cells containing a hidden face (select-all format).
 *
 * Results are written to llm_eval_sessions / llm_eval_results in PocketBase,
 * following the same schema/pattern as pocketbase-eval.ts.
 *
 * Usage (from repo root):
 *   npx tsx scripts/illusion-faces-eval.ts [--model <id>] [--limit N]
 *
 * Flags:
 *   --model  -m  OpenRouter model ID (default: google/gemini-3.1-pro-preview)
 *   --limit  -n  max captchas to evaluate (default: all)
 */

import PocketBase from "pocketbase";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { OpenRouter } from "@openrouter/sdk";

const repoRoot = resolve(process.cwd());
loadDotenv({ path: resolve(repoRoot, ".env") });

// ── Config ────────────────────────────────────────────────────────────────────

const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  process.env.POCKETBASE_URL ||
  "https://latcha-db.heimdal.dev";
const POCKETBASE_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const POCKETBASE_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;

if (!POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
  throw new Error(
    "Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD",
  );
}
if (!OPENROUTER_KEY) throw new Error("Missing OPENROUTER_API_KEY");

const openrouter = new OpenRouter({ apiKey: OPENROUTER_KEY });
let pbClient: PocketBase | null = null;

async function getPocketBaseAdminClient(): Promise<PocketBase> {
  if (pbClient) return pbClient;

  const pb = new PocketBase(POCKETBASE_URL);
  await pb.admins.authWithPassword(
    POCKETBASE_ADMIN_EMAIL!,
    POCKETBASE_ADMIN_PASSWORD!,
  );
  pbClient = pb;

  return pb;
}

const DEFAULT_MODEL = {
  id: "google/gemini-3.1-pro-preview",
  name: "Gemini 3.1 Pro Preview",
};
const TEMPERATURE = 0;
const MAX_TOKENS = 64;
const PROMPT_TEMPLATE = "select-all-grid-faces";

// ── Prompt ────────────────────────────────────────────────────────────────────

const SELECT_ALL_PROMPT = [
  "Select all images with hidden faces.",
  "",
  "The images are arranged in a 3×3 grid, numbered left-to-right, top-to-bottom:",
  "1 2 3",
  "4 5 6",
  "7 8 9",
  "",
  'Respond with ONLY the cell numbers that contain a hidden face, comma-separated (e.g. "1,3,7"). Nothing else.',
].join("\n");

// ── Parse / Score ─────────────────────────────────────────────────────────────

function parseCellAnswer(raw: string): string {
  const digits = raw.match(/[1-9]/g);
  if (digits && digits.length > 0) {
    const unique = Array.from(new Set(digits.map(Number)))
      .sort((a, b) => a - b)
      .map(String);
    return unique.join(",");
  }
  return raw.trim().toUpperCase();
}

/**
 * Tolerance scoring: ≤1 total error (missed + extra cells) passes.
 * Mirrors the logic in packages/eval/src/runner.ts.
 */
function isCorrectWithTolerance(parsed: string, correct: string): boolean {
  if (parsed.toUpperCase() === correct.toUpperCase()) return true;

  const toNums = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !isNaN(n));

  const correctNums = toNums(correct);
  const parsedNums = toNums(parsed);

  if (correctNums.length === 0 || parsedNums.length === 0) return false;

  const correctSet = new Set(correctNums);
  const parsedSet = new Set(parsedNums);

  let errors = 0;
  for (const n of correctSet) if (!parsedSet.has(n)) errors++; // missed
  for (const n of parsedSet) if (!correctSet.has(n)) errors++; // extra

  return errors <= 1;
}

// ── PocketBase helpers ────────────────────────────────────────────────────────

interface ImageRef {
  uuid: string;
  fileName: string;
  mimeType?: string;
}

interface IllusionFacesRow {
  id: string;
  collectionId: string;
  collectionName: string;
  challenge_id: string;
  question: string;
  correct_alternative: string;
  image?: string;
  image_uuid?: string;
  answer_alternatives: unknown;
  generation_specific_metadata: {
    grid_image_data_urls?: string[];
    imageRefs?: ImageRef[];
  };
}

async function fetchIllusionFacesCaptchas(
  limit?: number,
): Promise<IllusionFacesRow[]> {
  const pb = await getPocketBaseAdminClient();

  const rows = await pb.collection("captchas").getFullList<IllusionFacesRow>({
    sort: "generation_timestamp",
    filter: pb.filter("generation_type = {:generationType}", {
      generationType: "illusion-faces",
    }),
  });

  const result = limit ? rows.slice(0, limit) : rows;

  if (!result.length)
    throw new Error("No illusion-faces captchas found in database.");

  return result;
}

function getGridImageUrlCandidates(
  pb: PocketBase,
  row: IllusionFacesRow,
): string[][] {
  const dataUrls = row.generation_specific_metadata?.grid_image_data_urls;
  if (
    Array.isArray(dataUrls) &&
    dataUrls.length === 9 &&
    dataUrls.every(
      (url) => typeof url === "string" && url.startsWith("data:image/"),
    )
  ) {
    return dataUrls.map((url) => [url]);
  }

  const refs = row.generation_specific_metadata?.imageRefs;
  if (!refs || refs.length !== 9) {
    throw new Error(
      `Challenge ${row.challenge_id} has malformed imageRefs (expected 9, got ${refs?.length ?? 0}).`,
    );
  }

  const baseUrl = POCKETBASE_URL.replace(/\/+$/, "");
  const primaryUrl = row.image ? pb.files.getURL(row, row.image) : null;

  return refs.map((ref) => {
    const candidates: string[] = [];

    if (primaryUrl && row.image_uuid && ref.uuid === row.image_uuid) {
      candidates.push(primaryUrl);
    }

    // Best-effort migrated file references.
    candidates.push(
      `${baseUrl}/api/files/${row.collectionName}/${row.id}/${ref.fileName}`,
    );
    candidates.push(`${baseUrl}/captchas/illusion-faces/${ref.fileName}`);

    return [...new Set(candidates)];
  });
}

async function downloadFirstAvailableAsBase64(
  candidates: string[],
): Promise<string> {
  let lastStatus = "unreachable";

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastStatus = String(res.status);
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString("base64");
    } catch {
      lastStatus = "network_error";
    }
  }

  throw new Error(
    `Failed to download image from all candidate URLs (last status: ${lastStatus}).`,
  );
}

// ── OpenRouter call ───────────────────────────────────────────────────────────

async function evaluateGrid(
  modelId: string,
  imageBase64s: string[],
  prompt: string,
): Promise<{ raw: string; latencyMs: number }> {
  const start = Date.now();

  const response = await openrouter.chat.send({
    chatGenerationParams: {
      model: modelId,
      messages: [
        {
          role: "user",
          content: [
            ...imageBase64s.map((b64) => ({
              type: "image_url" as const,
              imageUrl: { url: `data:image/png;base64,${b64}` },
            })),
            { type: "text" as const, text: prompt },
          ],
        },
      ],
      temperature: TEMPERATURE,
      maxTokens: MAX_TOKENS,
      stream: false,
    },
  });

  const content = (
    response as { choices?: Array<{ message?: { content?: unknown } }> }
  ).choices?.[0]?.message?.content;

  let raw = "";
  if (typeof content === "string") {
    raw = content.trim();
  } else if (Array.isArray(content)) {
    raw = content
      .map((p) =>
        typeof p === "string" ? p : ((p as { text?: string }).text ?? ""),
      )
      .join("")
      .trim();
  }

  return { raw, latencyMs: Date.now() - start };
}

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(args: string[]) {
  let modelId = DEFAULT_MODEL.id;
  let modelName = DEFAULT_MODEL.name;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--model" || args[i] === "-m") && args[i + 1]) {
      modelId = args[++i]!;
      modelName = modelId;
    }
    if ((args[i] === "--limit" || args[i] === "-n") && args[i + 1]) {
      limit = parseInt(args[++i]!, 10);
    }
  }

  return { modelId, modelName, limit };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pb = await getPocketBaseAdminClient();
  const { modelId, modelName, limit } = parseArgs(process.argv.slice(2));

  console.log(
    `\n🔍 Fetching illusion-faces captchas from PocketBase${limit ? ` (limit: ${limit})` : ""}...`,
  );
  const captchas = await fetchIllusionFacesCaptchas(limit);
  console.log(`   Found ${captchas.length} captchas.\n`);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🤖 Model: ${modelName} (${modelId})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const startedAt = new Date().toISOString();
  let correctCount = 0;
  let totalLatency = 0;
  const resultsToInsert: object[] = [];

  // Insert session row upfront to get session_id
  const sessionData = (await pb.collection("llm_eval_sessions").create({
      model_id: modelId,
      model_name: modelName,
      prompt_template: PROMPT_TEMPLATE,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      generation_type: "illusion-faces",
      captcha_count: captchas.length,
      started_at: startedAt,
    })) as { id: string };

  const sessionId = sessionData.id;
  console.log(`   Session ID: ${sessionId}\n`);

  for (let i = 0; i < captchas.length; i++) {
    const captcha = captchas[i]!;

    process.stdout.write(
      `   [${i + 1}/${captchas.length}] ${captcha.challenge_id.slice(0, 8)}... `,
    );

    try {
      const urlCandidates = getGridImageUrlCandidates(pb, captcha);

      // Download all 9 grid images in parallel
      const imageBase64s = await Promise.all(
        urlCandidates.map(downloadFirstAvailableAsBase64),
      );

      const { raw, latencyMs } = await evaluateGrid(
        modelId,
        imageBase64s,
        SELECT_ALL_PROMPT,
      );
      const parsed = parseCellAnswer(raw);
      const isCorrect = isCorrectWithTolerance(parsed, captcha.correct_alternative);

      if (isCorrect) correctCount++;
      totalLatency += latencyMs;

      resultsToInsert.push({
        session: sessionId,
        captcha: captcha.id,
        question: captcha.question,
        answer_alternatives: captcha.answer_alternatives ?? [],
        correct_alternative: captcha.correct_alternative,
        prompt_sent: SELECT_ALL_PROMPT,
        raw_response: raw,
        parsed_answer: parsed,
        is_correct: isCorrect,
        latency_ms: latencyMs,
      });

      process.stdout.write(
        isCorrect
          ? `✓  (${latencyMs}ms)\n`
          : `✗  (said: "${parsed}", correct: "${captcha.correct_alternative}", ${latencyMs}ms)\n`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`ERROR: ${msg}\n`);
      resultsToInsert.push({
        session: sessionId,
        captcha: captcha.id,
        question: captcha.question,
        answer_alternatives: captcha.answer_alternatives ?? [],
        correct_alternative: captcha.correct_alternative,
        prompt_sent: SELECT_ALL_PROMPT,
        raw_response: `ERROR: ${msg}`,
        parsed_answer: "",
        is_correct: false,
        latency_ms: 0,
      });
    }
  }

  // Bulk insert results
  if (resultsToInsert.length > 0) {
    try {
      for (const result of resultsToInsert) {
        await pb.collection("llm_eval_results").create(result);
      }
    } catch (error) {
      console.error(
        `  ⚠️  Failed to save results: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Update session with final stats
  const accuracy = correctCount / captchas.length;
  const avgLatency = captchas.length > 0 ? totalLatency / captchas.length : 0;

  await pb.collection("llm_eval_sessions").update(sessionId, {
      correct_count: correctCount,
      accuracy,
      avg_latency_ms: avgLatency,
      finished_at: new Date().toISOString(),
    });

  console.log(
    `\n   ✅ ${correctCount}/${captchas.length} correct (${(accuracy * 100).toFixed(1)}%) - avg latency: ${Math.round(avgLatency)}ms`,
  );
  console.log(`   Session saved: ${sessionId}`);
  console.log("\n🏁 Done!\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
