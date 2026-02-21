"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  DashboardData,
  CategoryStat,
  ModelStat,
} from "../api/dashboard/route";

// ── helpers ────────────────────────────────────────────────────────────────────

function pct(n: number) {
  return (n * 100).toFixed(0) + "%";
}

function label(type: string) {
  return type
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function latency(ms: number) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Bar component ──────────────────────────────────────────────────────────────

function Bar({
  value,
  color,
  max = 1,
}: {
  value: number;
  color: string;
  max?: number;
}) {
  return (
    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}

// ── Gap badge ─────────────────────────────────────────────────────────────────

function GapBadge({ gap }: { gap: number }) {
  const isPositive = gap > 0;
  const abs = Math.abs(gap * 100).toFixed(0);
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
        isPositive
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-red-500/20 text-red-300"
      }`}
    >
      {isPositive ? "▲" : "▼"} {abs}pp
    </span>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryRow({ stat }: { stat: CategoryStat }) {
  const maxAcc = Math.max(stat.humanAccuracy, stat.aiAccuracy, 0.01);

  return (
    <div className="rounded-2xl bg-white/5 border border-white/8 p-4 sm:p-5 space-y-3 hover:bg-white/8 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm sm:text-base text-white">
          {label(stat.generationType)}
        </span>
        <GapBadge gap={stat.gap} />
      </div>

      {/* Human */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Human</span>
          <span className="tabular-nums font-medium text-white">
            {pct(stat.humanAccuracy)}{" "}
            <span className="text-slate-500">
              ({stat.humanCorrect}/{stat.humanTotal})
            </span>
          </span>
        </div>
        <Bar value={stat.humanAccuracy} color="bg-indigo-400" max={maxAcc} />
      </div>

      {/* AI */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>AI (avg)</span>
          <span className="tabular-nums font-medium text-white">
            {pct(stat.aiAccuracy)}{" "}
            <span className="text-slate-500">
              ({stat.aiCorrect}/{stat.aiTotal})
            </span>
          </span>
        </div>
        <Bar value={stat.aiAccuracy} color="bg-rose-400" max={maxAcc} />
      </div>
    </div>
  );
}

// ── Model row ─────────────────────────────────────────────────────────────────

function ModelRow({ m, rank }: { m: ModelStat; rank: number }) {
  const rankColors = [
    "text-yellow-400",
    "text-slate-300",
    "text-amber-600",
    "text-slate-500",
  ];
  const color = rankColors[rank] ?? "text-slate-500";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/6 last:border-0">
      <span className={`w-5 text-center font-bold text-sm ${color}`}>
        {rank + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{m.modelName}</p>
        <p className="text-xs text-slate-500 truncate">{m.modelId}</p>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        <p className="text-sm font-bold tabular-nums text-white">
          {pct(m.accuracy)}
        </p>
        <p className="text-xs text-slate-500 tabular-nums">
          {latency(m.avgLatencyMs)}
        </p>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 space-y-1 ${accent}`}>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">
        {label}
      </p>
      <p className="text-3xl font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d as DashboardData);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const bestGap = data?.categories[0];
  const worstGap = data?.categories[data.categories.length - 1];
  const avgHuman =
    data && data.categories.length
      ? data.categories.reduce((s, c) => s + c.humanAccuracy, 0) /
        data.categories.length
      : 0;
  const avgAI =
    data && data.categories.length
      ? data.categories.reduce((s, c) => s + c.aiAccuracy, 0) /
        data.categories.length
      : 0;

  return (
    <div className="min-h-screen bg-[#080b14] text-white font-sans">
      {/* Header */}
      <div className="border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Back
            </Link>
            <h1 className="text-base font-bold tracking-tight">
              <span className="text-indigo-400">Lacha</span>{" "}
              <span className="text-slate-400 font-normal">/ Dashboard</span>
            </h1>
          </div>
          <Link
            href="/demo"
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium"
          >
            Take Test →
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Human vs. AI Solvability
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl">
            Comparing human accuracy against averaged LLM performance across
            captcha categories. A large gap means humans dramatically outperform
            AI — ideal for a CAPTCHA.
          </p>
        </div>

        {/* Loading / error */}
        {!data && !error && (
          <div className="flex items-center gap-3 text-slate-400 py-12">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
            <span>Loading data from Supabase…</span>
          </div>
        )}
        {error && (
          <div className="rounded-2xl bg-red-900/30 border border-red-500/30 p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Avg Human"
                value={pct(avgHuman)}
                sub="across all categories"
                accent="bg-indigo-950/60 border-indigo-500/20"
              />
              <StatCard
                label="Avg AI"
                value={pct(avgAI)}
                sub={`${data.models.length} model${data.models.length !== 1 ? "s" : ""} tested`}
                accent="bg-rose-950/60 border-rose-500/20"
              />
              <StatCard
                label="Biggest Gap"
                value={bestGap ? `+${pct(bestGap.gap)}` : "—"}
                sub={bestGap ? label(bestGap.generationType) : ""}
                accent="bg-emerald-950/60 border-emerald-500/20"
              />
              <StatCard
                label="Human Sessions"
                value={String(data.humanSessionCount)}
                sub="total test runs"
                accent="bg-white/5 border-white/8"
              />
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Category table — takes 2/3 width */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">
                    By Category
                    <span className="ml-2 text-xs text-slate-500 font-normal">
                      sorted by human advantage
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                      Human
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                      AI
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {data.categories.map((cat) => (
                    <CategoryRow key={cat.generationType} stat={cat} />
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-6">
                {/* AI Leaderboard */}
                <div className="rounded-2xl bg-white/5 border border-white/8 p-4 sm:p-5">
                  <h3 className="text-sm font-semibold mb-3 text-slate-300">
                    AI Model Leaderboard
                  </h3>
                  {data.models.map((m, i) => (
                    <ModelRow key={m.modelId} m={m} rank={i} />
                  ))}
                  {data.models.length === 0 && (
                    <p className="text-xs text-slate-500">
                      No completed AI eval sessions yet.
                    </p>
                  )}
                </div>

                {/* Interpretation */}
                <div className="rounded-2xl bg-white/5 border border-white/8 p-4 sm:p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">
                    Best CAPTCHA Types
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Categories with the largest human↑ AI↓ gap make the most
                    effective CAPTCHAs — humans sail through them while AI
                    struggles.
                  </p>
                  <div className="space-y-2 pt-1">
                    {data.categories.slice(0, 3).map((c, i) => (
                      <div
                        key={c.generationType}
                        className="flex items-center gap-2"
                      >
                        <span
                          className={`text-xs font-bold w-4 ${
                            i === 0
                              ? "text-yellow-400"
                              : i === 1
                                ? "text-slate-300"
                                : "text-amber-600"
                          }`}
                        >
                          #{i + 1}
                        </span>
                        <span className="text-xs text-white flex-1">
                          {label(c.generationType)}
                        </span>
                        <GapBadge gap={c.gap} />
                      </div>
                    ))}
                  </div>
                  {worstGap && worstGap.gap < 0 && (
                    <p className="text-xs text-slate-500 pt-1 border-t border-white/6 mt-2">
                      ⚠️{" "}
                      <strong className="text-rose-400">
                        {label(worstGap.generationType)}
                      </strong>{" "}
                      — AI outperforms humans here. Consider retiring this type.
                    </p>
                  )}
                </div>

                {/* Last updated */}
                <p className="text-xs text-slate-600 text-right">
                  Updated{" "}
                  {new Date(data.lastUpdated).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
