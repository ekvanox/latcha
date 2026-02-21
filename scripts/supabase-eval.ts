/**
 * supabase-eval.ts
 *
 * Fetches all captchas from Supabase, evaluates them with one or more
 * OpenRouter LLMs, and writes results back into llm_eval_sessions /
 * llm_eval_results.
 *
 * Usage (from repo root):
 *   npx tsx scripts/supabase-eval.ts [--generator <type>] [--model <id>] [--limit N]
 *
 * Flags:
 *   --generator  -g  filter to a single generation_type (e.g. abutting-grating)
 *   --model      -m  override the default model (e.g. google/gemini-3-flash-preview)
 *   --limit      -n  max captchas to evaluate (default: all)
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

// Default models to evaluate against — edit freely
const DEFAULT_MODELS: { id: string; name: string }[] = [
  //   { id: "anthropic/claude-haiku-4.5", name: "Haiku 4.5" },
  //   { id: "minimax/minimax-01", name: "MiniMax-01" },
  //   { id: "qwen/qwen3.5-plus-02-15", name: "Qwen 3.5 Plus" },
  //   { id: "openai/gpt-5-mini", name: "GPT-5 mini" },
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash" },
];

const TEMPERATURE = 0;
const MAX_TOKENS = 2048;

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(args: string[]) {
  let generatorFilter: string | undefined;
  let modelOverride: string | undefined;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--generator" || args[i] === "-g") && args[i + 1])
      generatorFilter = args[++i];
    if ((args[i] === "--model" || args[i] === "-m") && args[i + 1])
      modelOverride = args[++i];
    if ((args[i] === "--limit" || args[i] === "-n") && args[i + 1])
      limit = parseInt(args[++i], 10);
  }

  return { generatorFilter, modelOverride, limit };
}

// ── Prompt helpers ─────────────────────────────────────────────────────────────

function buildPrompt(question: string, alternatives: string[]): string {
  return [
    question,
    "",
    ...alternatives.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`),
    "",
    "Respond with ONLY the letter of your answer (A, B, C, or D). Nothing else.",
  ].join("\n");
}

function parseAnswer(raw: string, alternatives: string[]): string {
  const cleaned = raw.trim().toUpperCase();
  const letterMatch = cleaned.match(/^([A-D])\b/);
  if (letterMatch) {
    const idx = letterMatch[1]!.charCodeAt(0) - 65;
    if (idx >= 0 && idx < alternatives.length) return alternatives[idx]!;
  }
  for (const opt of alternatives) {
    if (cleaned.includes(opt.toUpperCase())) return opt;
  }
  return cleaned;
}

// ── Supabase helpers ───────────────────────────────────────────────────────────

interface CaptchaRow {
  challenge_id: string;
  generation_type: string;
  bucket_path: string;
  question: string;
  answer_alternatives: string[];
  correct_alternative: string;
  generation_time_ms: number | null;
  generation_timestamp: string;
}

async function fetchCaptchas(
  generatorFilter?: string,
  limit?: number,
): Promise<CaptchaRow[]> {
  let query = supabase
    .from("captchas")
    .select(
      "challenge_id, generation_type, bucket_path, question, answer_alternatives, correct_alternative, generation_time_ms, generation_timestamp",
    )
    .order("generation_timestamp", { ascending: true });

  if (generatorFilter) query = query.eq("generation_type", generatorFilter);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch captchas: ${error.message}`);
  if (!data?.length) throw new Error("No captchas found in database.");
  return data as CaptchaRow[];
}

function getPublicImageUrl(bucketPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/captchas/${bucketPath}`;
}

async function downloadImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Failed to download image ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

// ── OpenRouter call ────────────────────────────────────────────────────────────

async function evaluateWithModel(
  modelId: string,
  imageBase64: string,
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
            {
              type: "image_url" as const,
              imageUrl: { url: `data:image/png;base64,${imageBase64}` },
            },
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
  if (typeof content === "string") raw = content.trim();
  else if (Array.isArray(content)) {
    raw = content
      .map((p) =>
        typeof p === "string" ? p : ((p as { text?: string }).text ?? ""),
      )
      .join("")
      .trim();
  }

  return { raw, latencyMs: Date.now() - start };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const { generatorFilter, modelOverride, limit } = parseArgs(
    process.argv.slice(2),
  );

  const models = modelOverride
    ? [{ id: modelOverride, name: modelOverride }]
    : DEFAULT_MODELS;

  console.log(
    `\n🔍 Fetching captchas from Supabase${generatorFilter ? ` (type: ${generatorFilter})` : ""}${limit ? ` (limit: ${limit})` : ""}...`,
  );
  const captchas = await fetchCaptchas(generatorFilter, limit);
  console.log(`   Found ${captchas.length} captchas.\n`);

  for (const model of models) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🤖 Model: ${model.name} (${model.id})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const startedAt = new Date().toISOString();
    let correctCount = 0;
    let totalLatency = 0;
    const resultsToInsert: object[] = [];

    // Insert session row upfront to get session_id
    const { data: sessionData, error: sessionErr } = await supabase
      .from("llm_eval_sessions")
      .insert({
        model_id: model.id,
        model_name: model.name,
        prompt_template: "multiple-choice-letter",
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        generation_type: generatorFilter ?? null,
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
      const imageUrl = getPublicImageUrl(captcha.bucket_path);
      const prompt = buildPrompt(captcha.question, captcha.answer_alternatives);

      process.stdout.write(
        `   [${i + 1}/${captchas.length}] ${captcha.generation_type}/${captcha.challenge_id.slice(0, 8)}... `,
      );

      try {
        const imageBase64 = await downloadImageAsBase64(imageUrl);
        const { raw, latencyMs } = await evaluateWithModel(
          model.id,
          imageBase64,
          prompt,
        );
        const parsed = parseAnswer(raw, captcha.answer_alternatives);
        const isCorrect =
          parsed.toUpperCase() === captcha.correct_alternative.toUpperCase();

        if (isCorrect) correctCount++;
        totalLatency += latencyMs;

        resultsToInsert.push({
          session_id: sessionId,
          captcha_id: captcha.challenge_id,
          question: captcha.question,
          answer_alternatives: captcha.answer_alternatives,
          correct_alternative: captcha.correct_alternative,
          prompt_sent: prompt,
          raw_response: raw,
          parsed_answer: parsed,
          is_correct: isCorrect,
          latency_ms: latencyMs,
        });

        process.stdout.write(
          isCorrect
            ? "✓\n"
            : `✗  (said: ${parsed}, correct: ${captcha.correct_alternative})\n`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(`ERROR: ${msg}\n`);
        resultsToInsert.push({
          session_id: sessionId,
          captcha_id: captcha.challenge_id,
          question: captcha.question,
          answer_alternatives: captcha.answer_alternatives,
          correct_alternative: captcha.correct_alternative,
          prompt_sent: prompt,
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
      if (resultsErr)
        console.error(`  ⚠️  Failed to save results: ${resultsErr.message}`);
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
  }

  console.log("\n🏁 All models evaluated. Done!\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
