import Link from "next/link";
import { ArrowRight, Shield, Bot, Users, ExternalLink } from "lucide-react";
import StatsChart from "@/components/StatsChart";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-6xl mx-auto">
        <Link href="/" className="inline-block">
          <img
            src="/logo.png"
            alt="latcha logo"
            className="w-8 h-8"
          />
        </Link>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
        >
          Dashboard
          <ExternalLink className="w-4 h-4" />
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-20 pb-28 max-w-3xl mx-auto animate-fade-in-up">
        <p className="text-xs font-semibold tracking-[0.25em] uppercase text-muted-foreground mb-6">
          AI-Proof Verification
        </p>
        <h1 className="text-5xl md:text-7xl font-serif text-foreground leading-tight mb-6 whitespace-normal">
          The LLM-Proof Captcha of the Future
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
          Bots got smarter. Your captcha should too. Latcha stops AI agents cold
          while keeping the experience seamless for real humans.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://matcha-meadow-hub.lovable.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-lg text-base font-medium hover:opacity-90 transition-opacity"
          >
            Live Demo <ArrowRight className="w-4 h-4" />
          </a>
          <Link
            href="/research"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors underline"
          >
            See research analysis
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: Shield,
              title: "LLM Resistant",
              desc: "Purpose-built challenges that multimodal AI models cannot solve, even with tool use.",
            },
            {
              icon: Users,
              title: "Human Friendly",
              desc: "97%+ human solve rate. No more fire hydrants, crosswalks, or blurry text.",
            },
            {
              icon: Bot,
              title: "Adaptive Difficulty",
              desc: "Threat-level scoring adjusts challenge complexity in real time, zero friction for trusted users.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-card rounded-xl p-8 border border-border"
            >
              <f.icon className="w-6 h-6 text-primary mb-4" />
              <h3 className="font-serif text-xl text-foreground mb-2">
                {f.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="bg-card border-y border-border py-24 px-6">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-muted-foreground mb-4">
            Performance
          </p>
          <h2 className="text-3xl md:text-5xl font-serif text-foreground mb-4">
            Numbers Don&apos;t Lie
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Same human pass rate. Dramatically lower AI solve rate. That&apos;s
            the Latcha difference.
          </p>
        </div>
        <StatsChart />
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-5xl font-serif text-foreground mb-6">
          Ready to outsmart the bots?
        </h2>
        <p className="text-muted-foreground mb-10">
          Integrate Latcha in minutes. One script tag. Full protection.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-10 py-4 rounded-lg text-lg font-medium hover:opacity-90 transition-opacity"
        >
          Open Dashboard <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 px-6 text-center">
        <p className="font-serif text-xl text-primary mb-2">latcha</p>
        <a
          href="mailto:hello@latcha.dev"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          hello@latcha.dev
        </a>
      </footer>
    </div>
  );
};

export default Index;
