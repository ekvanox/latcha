import Link from "next/link";
import { ExternalLink } from "lucide-react";

export default function DashboardPackagePage() {
  return (
    <div className="min-h-screen bg-[var(--cream)]">
      {/* Nav */}
      <nav className="border-b border-[var(--card-border)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            >
              <img src="/logo.png" alt="latcha logo" className="w-6 h-6" />
            </Link>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-sm text-[var(--text-muted)]">Dashboard</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Heading */}
        <header className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-normal text-[var(--olive)]" style={{ fontFamily: "var(--font-serif)" }}>
            Latcha Dashboard Package
          </h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            A lightweight React component you can drop into any project. Shows
            captcha performance and metadata in your own UI.
          </p>
        </header>

        {/* Installation guide */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Getting started
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Install the package from npm and render the <code className="font-mono">&lt;Dashboard /&gt;</code> component
            wherever you'd like to show analytics.
          </p>
          <pre className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 overflow-x-auto text-sm">
            <code>{`npm install latcha

// or
pnpm add latcha

yarn add latcha`}</code>
          </pre>
          <pre className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 overflow-x-auto text-sm">
            <code>{`import { Dashboard } from "latcha";

function App() {
  return (
    <div>
      <h1>Captcha analytics</h1>
      <Dashboard />
    </div>
  );
}

export default App;`}</code>
          </pre>
        </section>

        {/* Placeholder image */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Example layout
          </h2>
          <div className="w-full h-64 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl flex items-center justify-center text-[var(--text-muted)]">
            Placeholder for screenshot
          </div>
        </section>

        {/* NPM link */}
        <section className="py-4">
          <a
            href="https://www.npmjs.com/package/latcha"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--olive)] hover:underline"
          >
            View on npm <ExternalLink className="w-4 h-4" />
          </a>
        </section>
      </div>
    </div>
  );
}
