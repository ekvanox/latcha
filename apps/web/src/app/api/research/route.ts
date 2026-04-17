import { NextResponse } from "next/server";
import { createPocketBaseClient } from "@/lib/pocketbase";

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
  try {
    const pb = createPocketBaseClient();

    type Bucket = { correct: number; total: number };
    type CaptchaExpand = { captcha?: { generation_type?: string } };
    type EvalRecord = { is_correct?: boolean; expand?: CaptchaExpand };
    type LLMSessionRecord = {
      model_id: string;
      model_name: string;
      accuracy?: number;
      avg_latency_ms?: number;
      correct_count?: number;
      captcha_count?: number;
      started_at: string;
      finished_at?: string | null;
    };
    type CaptchaRecord = {
      id: string;
      collectionId: string;
      collectionName: string;
      generation_type?: string;
      image?: string;
    };

    // ── Human and LLM results with captcha relation expansion ──────────────────
    const [humanRaw, llmRaw, sessionsRaw, humanSessions, captchaRows] =
      await Promise.all([
        pb.collection("eval_results").getFullList({ expand: "captcha" }) as Promise<
          EvalRecord[]
        >,
        pb.collection("llm_eval_results").getFullList({
          expand: "captcha",
        }) as Promise<EvalRecord[]>,
        pb.collection("llm_eval_sessions").getFullList({
          sort: "-started_at",
        }) as Promise<LLMSessionRecord[]>,
        pb.collection("eval_sessions").getFullList({ fields: "id" }) as Promise<
          Array<{ id: string }>
        >,
        pb.collection("captchas").getFullList({
          sort: "-generation_timestamp",
        }) as Promise<CaptchaRecord[]>,
      ]);

    // ── Aggregate per-category ─────────────────────────────────────────────────
    const humanByType = new Map<string, Bucket>();
    const llmByType = new Map<string, Bucket>();

    for (const r of humanRaw) {
      const type = r.expand?.captcha?.generation_type;
      if (!type) continue;
      const bucket = humanByType.get(type) ?? { correct: 0, total: 0 };
      bucket.total++;
      if (r.is_correct) bucket.correct++;
      humanByType.set(type, bucket);
    }

    for (const r of llmRaw) {
      const type = r.expand?.captcha?.generation_type;
      if (!type) continue;
      const bucket = llmByType.get(type) ?? { correct: 0, total: 0 };
      bucket.total++;
      if (r.is_correct) bucket.correct++;
      llmByType.set(type, bucket);
    }

    const allTypes = new Set([...humanByType.keys(), ...llmByType.keys()]);
    const categories: CategoryStat[] = [];

    for (const type of allTypes) {
      const human = humanByType.get(type) ?? { correct: 0, total: 0 };
      const ai = llmByType.get(type) ?? { correct: 0, total: 0 };
      const humanAccuracy = human.total > 0 ? human.correct / human.total : 0;
      const aiAccuracy = ai.total > 0 ? ai.correct / ai.total : 0;

      categories.push({
        generationType: type,
        humanAccuracy,
        humanCorrect: human.correct,
        humanTotal: human.total,
        aiAccuracy,
        aiCorrect: ai.correct,
        aiTotal: ai.total,
        gap: humanAccuracy - aiAccuracy,
        sampleImages: [],
      });
    }

    categories.sort((a, b) => b.gap - a.gap);

    // ── Sample images per category ─────────────────────────────────────────────
    const imagesByType = new Map<string, string[]>();
    for (const row of captchaRows) {
      if (!row.generation_type || !row.image) continue;
      const arr = imagesByType.get(row.generation_type) ?? [];
      arr.push(pb.files.getURL(row, row.image));
      imagesByType.set(row.generation_type, arr);
    }

    const ILLUSION_DIFFUSION_SAMPLES = [
      "https://v3b.fal.media/files/b/0a8f613a/3F4ThP2efTAXF-knZ3hvz_3a1f5add67124b47858b58a216afab91.png",
      "https://v3b.fal.media/files/b/0a8f613d/Au549LskDGVxzZhXkw3bx_1b821947c5f34e59869b6a957f2ec736.png",
    ];

    for (const category of categories) {
      if (category.generationType === "illusion-diffusion") {
        category.sampleImages = ILLUSION_DIFFUSION_SAMPLES;
        continue;
      }

      const pool = imagesByType.get(category.generationType) ?? [];
      const copy = [...pool];
      for (let i = copy.length - 1; i > 0 && i >= copy.length - 2; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      category.sampleImages = copy.slice(0, 2);
    }

    // ── Deduplicate models (latest session per model_id) ──────────────────────
    const completedSessions = sessionsRaw.filter((s) => Boolean(s.finished_at));
    const modelMap = new Map<string, ModelStat>();
    for (const session of completedSessions) {
      if (modelMap.has(session.model_id)) continue;
      modelMap.set(session.model_id, {
        modelId: session.model_id,
        modelName: session.model_name,
        accuracy: session.accuracy ?? 0,
        avgLatencyMs: session.avg_latency_ms ?? 0,
        correctCount: session.correct_count ?? 0,
        captchaCount: session.captcha_count ?? 0,
        startedAt: session.started_at,
      });
    }

    const models = [...modelMap.values()].sort((a, b) => b.accuracy - a.accuracy);

    const data: ResearchData = {
      categories,
      models,
      humanSessionCount: humanSessions.length,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load research data.",
      },
      { status: 500 },
    );
  }
}
