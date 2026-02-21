import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.heimdal.dev";

function bucketImageUrl(bucketPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/captchas/${bucketPath}`;
}

export interface CategoryStat {
  generationType: string;
  humanAccuracy: number;
  humanCorrect: number;
  humanTotal: number;
  aiAccuracy: number;
  aiCorrect: number;
  aiTotal: number;
  /** human - ai, positive = human is better */
  gap: number;
  /** Up to 2 random sample image URLs for this category */
  sampleImages: string[];
}

export interface ModelStat {
  modelId: string;
  modelName: string;
  accuracy: number;
  avgLatencyMs: number;
  correctCount: number;
  captchaCount: number;
  startedAt: string;
}

export interface ResearchData {
  categories: CategoryStat[];
  models: ModelStat[];
  humanSessionCount: number;
  lastUpdated: string;
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  // ── Human results joined with captchas ──────────────────────────────────────
  const { data: humanRaw, error: humanErr } = await supabase
    .from("eval_results")
    .select("is_correct, captchas!inner(generation_type)");

  if (humanErr) {
    return NextResponse.json({ error: humanErr.message }, { status: 500 });
  }

  // ── LLM results joined with captchas ────────────────────────────────────────
  const { data: llmRaw, error: llmErr } = await supabase
    .from("llm_eval_results")
    .select("is_correct, captchas!inner(generation_type)");

  if (llmErr) {
    return NextResponse.json({ error: llmErr.message }, { status: 500 });
  }

  // ── LLM sessions (completed only) ───────────────────────────────────────────
  const { data: sessionsRaw, error: sessErr } = await supabase
    .from("llm_eval_sessions")
    .select(
      "model_id, model_name, accuracy, avg_latency_ms, correct_count, captcha_count, started_at",
    )
    .not("finished_at", "is", null)
    .order("started_at", { ascending: false });

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  // ── Human session count ──────────────────────────────────────────────────────
  const { count: humanSessionCount } = await supabase
    .from("eval_sessions")
    .select("id", { count: "exact", head: true });

  // ── Aggregate per-category ───────────────────────────────────────────────────
  type Bucket = { correct: number; total: number };
  const humanByType = new Map<string, Bucket>();
  const llmByType = new Map<string, Bucket>();

  for (const r of humanRaw ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (r as any).captchas?.generation_type as string;
    if (!t) continue;
    const b = humanByType.get(t) ?? { correct: 0, total: 0 };
    b.total++;
    if (r.is_correct) b.correct++;
    humanByType.set(t, b);
  }

  for (const r of llmRaw ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (r as any).captchas?.generation_type as string;
    if (!t) continue;
    const b = llmByType.get(t) ?? { correct: 0, total: 0 };
    b.total++;
    if (r.is_correct) b.correct++;
    llmByType.set(t, b);
  }

  const allTypes = new Set([...humanByType.keys(), ...llmByType.keys()]);
  const categories: CategoryStat[] = [];

  for (const t of allTypes) {
    const h = humanByType.get(t) ?? { correct: 0, total: 0 };
    const a = llmByType.get(t) ?? { correct: 0, total: 0 };
    const humanAcc = h.total > 0 ? h.correct / h.total : 0;
    const aiAcc = a.total > 0 ? a.correct / a.total : 0;
    categories.push({
      generationType: t,
      humanAccuracy: humanAcc,
      humanCorrect: h.correct,
      humanTotal: h.total,
      aiAccuracy: aiAcc,
      aiCorrect: a.correct,
      aiTotal: a.total,
      gap: humanAcc - aiAcc,
      sampleImages: [],
    });
  }

  // Sort by gap descending (biggest human advantage first)
  categories.sort((a, b) => b.gap - a.gap);

  // ── Sample images per category ───────────────────────────────────────────────
  const { data: captchaRows } = await supabase
    .from("captchas")
    .select("generation_type, bucket_path, generation_specific_metadata");

  // Collect individual face-cell URLs from illusion-faces imageRefs
  const illusionFaceCellUrls: string[] = [];

  const imagesByType = new Map<string, string[]>();
  for (const row of captchaRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const t = r.generation_type as string;
    const bp = r.bucket_path as string | undefined;
    if (!t || !bp) continue;

    if (t === "illusion-faces") {
      // Collect every individual cell image from imageRefs
      const refs: Array<{ fileName: string }> =
        r.generation_specific_metadata?.imageRefs ?? [];
      for (const ref of refs) {
        if (ref.fileName) {
          illusionFaceCellUrls.push(
            bucketImageUrl(`illusion-faces/${ref.fileName}`),
          );
        }
      }
    } else {
      const arr = imagesByType.get(t) ?? [];
      arr.push(bucketImageUrl(bp));
      imagesByType.set(t, arr);
    }
  }

  // Attach 2 random samples to each category.
  // "illusion-diffusion" shows face cells instead of its own images.
  for (const cat of categories) {
    const pool =
      cat.generationType === "illusion-diffusion"
        ? illusionFaceCellUrls
        : (imagesByType.get(cat.generationType) ?? []);
    // Fisher-Yates partial shuffle to pick 2
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0 && i >= copy.length - 2; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    cat.sampleImages = copy.slice(0, 2);
  }

  // ── Deduplicate models (take latest session per model_id) ───────────────────
  const modelMap = new Map<string, ModelStat>();
  for (const s of sessionsRaw ?? []) {
    if (!modelMap.has(s.model_id)) {
      modelMap.set(s.model_id, {
        modelId: s.model_id,
        modelName: s.model_name,
        accuracy: s.accuracy,
        avgLatencyMs: s.avg_latency_ms,
        correctCount: s.correct_count,
        captchaCount: s.captcha_count,
        startedAt: s.started_at,
      });
    }
  }
  const models = [...modelMap.values()].sort((a, b) => b.accuracy - a.accuracy);

  const data: ResearchData = {
    categories,
    models,
    humanSessionCount: humanSessionCount ?? 0,
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(data);
}
