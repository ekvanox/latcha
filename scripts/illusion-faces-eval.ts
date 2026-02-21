/**
 * illusion-faces-eval.ts
 *
 * Evaluates frontier LLMs on the illusion-faces 3×3 grid CAPTCHA.
 * Each challenge sends 9 grid images to the model; it must identify
 * all cells containing a hidden face (select-all format).
 *
 * Results are written to llm_eval_sessions / llm_eval_results in Supabase,
 * following the same schema/pattern as supabase-eval.ts.
 *
 * Usage (from repo root):
 *   npx tsx scripts/illusion-faces-eval.ts [--model <id>] [--limit N]
 *
 * Flags:
 *   --model  -m  OpenRouter model ID (default: google/gemini-3.1-pro-preview)
 *   --limit  -n  max captchas to evaluate (default: all)
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { OpenRouter } from "@openrouter/sdk";

const repoRoot = resolve(process.cwd());
loadDotenv({ path: resolve(repoRoot, ".env") });

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;

if (!SUPABASE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!OPENROUTER_KEY) throw new Error("Missing OPENROUTER_API_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openrouter = new OpenRouter({ apiKey: OPENROUTER_KEY });

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

// ── Supabase helpers ──────────────────────────────────────────────────────────

interface ImageRef {
  uuid: string;
  fileName: string;
  mimeType?: string;
}

interface IllusionFacesRow {
  challenge_id: string;
  question: string;
  correct_alternative: string;
  answer_alternatives: unknown;
  generation_specific_metadata: {
    imageRefs?: ImageRef[];
  };
}

async function fetchIllusionFacesCaptchas(
  limit?: number,
): Promise<IllusionFacesRow[]> {
  let query = supabase
    .from("captchas")
    .select(
      "challenge_id, question, correct_alternative, answer_alternatives, generation_specific_metadata",
    )
    .eq("generation_type", "illusion-faces")
    .order("created_at", { ascending: true });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch captchas: ${error.message}`);
  if (!data?.length)
    throw new Error("No illusion-faces captchas found in database.");
  return data as IllusionFacesRow[];
}

function getGridImageUrls(row: IllusionFacesRow): string[] {
  const refs = row.generation_specific_metadata?.imageRefs;
  if (!refs || refs.length !== 9) {
    throw new Error(
      `Challenge ${row.challenge_id} has malformed imageRefs (expected 9, got ${refs?.length ?? 0}).`,
    );
  }
  return refs.map(
    (ref) =>
      `${SUPABASE_URL}/storage/v1/object/public/captchas/illusion-faces/${ref.uuid}.webp`,
  );
}

async function downloadImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Failed to download image ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
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
  const { modelId, modelName, limit } = parseArgs(process.argv.slice(2));

  console.log(
    `\n🔍 Fetching illusion-faces captchas from Supabase${limit ? ` (limit: ${limit})` : ""}...`,
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
  const { data: sessionData, error: sessionErr } = await supabase
    .from("llm_eval_sessions")
    .insert({
      model_id: modelId,
      model_name: modelName,
      prompt_template: PROMPT_TEMPLATE,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      generation_type: "illusion-faces",
      captcha_count: captchas.length,
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (sessionErr || !sessionData) {
    throw new Error(`Failed to create session: ${sessionErr?.message}`);
  }

  const sessionId = sessionData.id;
  console.log(`   Session ID: ${sessionId}\n`);

  for (let i = 0; i < captchas.length; i++) {
    const captcha = captchas[i]!;

    process.stdout.write(
      `   [${i + 1}/${captchas.length}] ${captcha.challenge_id.slice(0, 8)}... `,
    );

    try {
      const urls = getGridImageUrls(captcha);

      // Download all 9 grid images in parallel
      const imageBase64s = await Promise.all(urls.map(downloadImageAsBase64));

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
        session_id: sessionId,
        captcha_id: captcha.challenge_id,
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
        session_id: sessionId,
        captcha_id: captcha.challenge_id,
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
    const { error: resultsErr } = await supabase
      .from("llm_eval_results")
      .insert(resultsToInsert);
    if (resultsErr) {
      console.error(`  ⚠️  Failed to save results: ${resultsErr.message}`);
    }
  }

  // Update session with final stats
  const accuracy = correctCount / captchas.length;
  const avgLatency = captchas.length > 0 ? totalLatency / captchas.length : 0;

  await supabase
    .from("llm_eval_sessions")
    .update({
      correct_count: correctCount,
      accuracy,
      avg_latency_ms: avgLatency,
      finished_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  console.log(
    `\n   ✅ ${correctCount}/${captchas.length} correct (${(accuracy * 100).toFixed(1)}%) — avg latency: ${Math.round(avgLatency)}ms`,
  );
  console.log(`   Session saved: ${sessionId}`);
  console.log("\n🏁 Done!\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
