/**
 * supabase-eval.ts
 *
 * Fetches all captchas from PocketBase, evaluates them with one or more
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

// Default models to evaluate against - edit freely
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

// ── PocketBase helpers ─────────────────────────────────────────────────────────

interface CaptchaRow {
  id: string;
  collectionId: string;
  collectionName: string;
  challenge_id: string;
  generation_type: string;
  question: string;
  answer_alternatives: string[];
  correct_alternative: string;
  generation_time_ms: number | null;
  generation_timestamp: string;
  image?: string;
}

async function fetchCaptchas(
  generatorFilter?: string,
  limit?: number,
): Promise<CaptchaRow[]> {
  const pb = await getPocketBaseAdminClient();

  const rows = await pb.collection("captchas").getFullList<CaptchaRow>({
    sort: "generation_timestamp",
    ...(generatorFilter
      ? {
          filter: pb.filter("generation_type = {:generationType}", {
            generationType: generatorFilter,
          }),
        }
      : {}),
  });

  const result = limit ? rows.slice(0, limit) : rows;
  if (!result.length) throw new Error("No captchas found in database.");

  return result;
}

function getPublicImageUrl(pb: PocketBase, row: CaptchaRow): string {
  if (!row.image) {
    throw new Error(
      `Captcha ${row.challenge_id} is missing the PocketBase image file field.`,
    );
  }

  return pb.files.getURL(row, row.image);
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
  const pb = await getPocketBaseAdminClient();
  const { generatorFilter, modelOverride, limit } = parseArgs(
    process.argv.slice(2),
  );

  const models = modelOverride
    ? [{ id: modelOverride, name: modelOverride }]
    : DEFAULT_MODELS;

  console.log(
    `\n🔍 Fetching captchas from PocketBase${generatorFilter ? ` (type: ${generatorFilter})` : ""}${limit ? ` (limit: ${limit})` : ""}...`,
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
    const sessionData = (await pb.collection("llm_eval_sessions").create({
        model_id: model.id,
        model_name: model.name,
        prompt_template: "multiple-choice-letter",
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        generation_type: generatorFilter ?? "",
        captcha_count: captchas.length,
        started_at: startedAt,
      })) as { id: string };

    const sessionId = sessionData.id;
    console.log(`   Session ID: ${sessionId}\n`);

    for (let i = 0; i < captchas.length; i++) {
      const captcha = captchas[i]!;
      const imageUrl = getPublicImageUrl(pb, captcha);
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
          session: sessionId,
          captcha: captcha.id,
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
          session: sessionId,
          captcha: captcha.id,
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
  }

  console.log("\n🏁 All models evaluated. Done!\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
