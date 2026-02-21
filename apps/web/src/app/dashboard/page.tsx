"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  DashboardData,
  CategoryStat,
  ModelStat,
} from "../api/dashboard/route";

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Bar ────────────────────────────────────────────────────────────────────────

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-[var(--cream-darker)] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
        style={{ width: `${Math.min(value * 100, 100)}%` }}
      />
    </div>
  );
}

// ── Gap badge ──────────────────────────────────────────────────────────────────

function GapBadge({ gap }: { gap: number }) {
  const positive = gap > 0;
  const abs = Math.abs(gap * 100).toFixed(0);
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
        positive
          ? "bg-[var(--olive)]/10 text-[var(--olive)]"
          : "bg-red-100 text-red-700"
      }`}
    >
      {positive ? "▲" : "▼"} {abs}pp
    </span>
  );
}

// ── Category row ───────────────────────────────────────────────────────────────

function CategoryRow({ stat }: { stat: CategoryStat }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-3 hover:border-[var(--olive-muted)]/40 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-semibold text-sm text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {label(stat.generationType)}
        </span>
        <GapBadge gap={stat.gap} />
      </div>

      {/* Human */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>Human</span>
          <span className="tabular-nums font-medium text-[var(--foreground)]">
            {pct(stat.humanAccuracy)}{" "}
            <span className="text-[var(--text-muted)]">
              ({stat.humanCorrect}/{stat.humanTotal})
            </span>
          </span>
        </div>
        <Bar value={stat.humanAccuracy} color="bg-[var(--olive)]" />
      </div>

      {/* AI */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>AI (avg)</span>
          <span className="tabular-nums font-medium text-[var(--foreground)]">
            {pct(stat.aiAccuracy)}{" "}
            <span className="text-[var(--text-muted)]">
              ({stat.aiCorrect}/{stat.aiTotal})
            </span>
          </span>
        </div>
        <Bar value={stat.aiAccuracy} color="bg-[var(--cream-darker)]" />
      </div>
    </div>
  );
}

// ── Model row ──────────────────────────────────────────────────────────────────

function ModelRow({ m, rank }: { m: ModelStat; rank: number }) {
  const medals = ["🥇", "🥈", "🥉"];
  const medal = medals[rank];

  return (
    <div className="flex items-center gap-3 py-3 border-b border-[var(--card-border)] last:border-0">
      <span className="w-6 text-center text-sm">
        {medal ?? (
          <span className="text-[var(--text-muted)] font-medium">
            {rank + 1}
          </span>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--foreground)] truncate">
          {m.modelName}
        </p>
        <p className="text-xs text-[var(--text-muted)] truncate">{m.modelId}</p>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        <p className="text-sm font-bold tabular-nums text-[var(--olive)]">
          {pct(m.accuracy)}
        </p>
        <p className="text-xs text-[var(--text-muted)] tabular-nums">
          {latency(m.avgLatencyMs)}
        </p>
      </div>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-1">
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-widest">
        {title}
      </p>
      <p
        className="text-3xl font-normal tabular-nums text-[var(--olive)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

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
    <div className="min-h-screen bg-[var(--cream)]">
      {/* Nav */}
      <nav className="border-b border-[var(--card-border)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            >
              <span className="text-xl">🍃</span>
              <span className="text-base font-semibold text-[var(--foreground)]">
                lacha
              </span>
            </Link>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-sm text-[var(--text-muted)]">Dashboard</span>
          </div>
          <Link
            href="/demo"
            className="text-xs px-4 py-2 rounded-full bg-[var(--olive)] text-white font-semibold hover:bg-[var(--olive-light)] transition-colors"
          >
            Take Test →
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Title */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--olive-muted)]">
            Performance Analytics
          </p>
          <h2
            className="text-3xl sm:text-4xl font-normal text-[var(--olive)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Human vs. AI Solvability
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            Comparing human accuracy against averaged LLM performance across
            captcha categories. A large gap means humans dramatically outperform
            AI — ideal for a CAPTCHA.
          </p>
        </div>

        {/* Loading / Error */}
        {!data && !error && (
          <div className="flex items-center gap-3 text-[var(--text-muted)] py-16 justify-center">
            <div className="w-5 h-5 border-2 border-[var(--cream-darker)] border-t-[var(--olive)] rounded-full animate-spin" />
            <span className="text-sm">Loading data…</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                title="Avg Human"
                value={pct(avgHuman)}
                sub="across all categories"
              />
              <StatCard
                title="Avg AI"
                value={pct(avgAI)}
                sub={`${data.models.length} model${data.models.length !== 1 ? "s" : ""} tested`}
              />
              <StatCard
                title="Biggest Gap"
                value={bestGap ? `+${pct(bestGap.gap)}` : "—"}
                sub={bestGap ? label(bestGap.generationType) : ""}
              />
              <StatCard
                title="Human Sessions"
                value={String(data.humanSessionCount)}
                sub="total test runs"
              />
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Categories panel */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-[var(--foreground)]">
                    By Category
                    <span className="ml-2 text-xs text-[var(--text-muted)] font-normal">
                      sorted by human advantage
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[var(--olive)] inline-block" />
                      Human
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[var(--cream-darker)] inline-block" />
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

              {/* Right sidebar */}
              <div className="space-y-6">
                {/* Model leaderboard */}
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                    AI Model Leaderboard
                  </h3>
                  {data.models.map((m, i) => (
                    <ModelRow key={m.modelId} m={m} rank={i} />
                  ))}
                  {data.models.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)]">
                      No completed AI eval sessions yet.
                    </p>
                  )}
                </div>

                {/* Best CAPTCHA types */}
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    Best CAPTCHA Types
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Categories with the largest human↑ AI↓ gap make the most
                    effective CAPTCHAs.
                  </p>
                  <div className="space-y-2 pt-1">
                    {data.categories.slice(0, 3).map((c, i) => (
                      <div
                        key={c.generationType}
                        className="flex items-center gap-2"
                      >
                        <span className="text-sm w-5">
                          {["🥇", "🥈", "🥉"][i]}
                        </span>
                        <span className="text-xs text-[var(--foreground)] flex-1">
                          {label(c.generationType)}
                        </span>
                        <GapBadge gap={c.gap} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Last updated */}
                <p className="text-xs text-[var(--text-muted)] text-right">
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
