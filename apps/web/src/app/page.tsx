import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--cream)]">
      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🍃</span>
          <span className="text-lg font-semibold text-[var(--foreground)]">
            lacha
          </span>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-[var(--olive)] hover:text-[var(--olive-light)] transition-colors"
        >
          Dashboard →
        </Link>
      </nav>

      {/* Hero */}
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--olive-muted)] mb-6">
          AI-Proof Verification
        </p>
        <h1
          className="text-5xl sm:text-6xl md:text-7xl font-normal leading-[1.1] text-[var(--olive)] mb-6"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          The LLM-Proof
          <br />
          Captcha of the Future
        </h1>
        <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto mb-10 leading-relaxed">
          Bots got smarter. Your captcha should too. Lacha stops AI agents cold
          while keeping the experience seamless for real humans.
        </p>
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 px-7 py-3.5 bg-[var(--olive)] text-white rounded-full text-sm font-semibold hover:bg-[var(--olive-light)] transition-colors shadow-sm"
        >
          Get Started <span aria-hidden>→</span>
        </Link>
      </main>

      {/* Feature cards */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeatureCard
            icon="🛡"
            title="LLM Resistant"
            description="Purpose-built challenges that multimodal AI models cannot solve, even with tool use."
          />
          <FeatureCard
            icon="👥"
            title="Human Friendly"
            description="97%+ human solve rate. No more fire hydrants, crosswalks, or blurry text."
          />
          <FeatureCard
            icon="⚡"
            title="Adaptive Difficulty"
            description="Threat-level scoring adjusts challenge complexity in real time, zero friction for trusted users."
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-3">
      <span className="text-2xl">{icon}</span>
      <h3 className="text-base font-bold text-[var(--foreground)]">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {description}
      </p>
    </div>
  );
}
