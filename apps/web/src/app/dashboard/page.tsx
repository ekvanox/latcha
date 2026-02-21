import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { LiveDemo } from "./LiveDemo";
import { CodeBlock } from "./CodeBlock";

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

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">

        {/* ── Hero ── */}
        <header className="space-y-3">
          <h1
            className="text-3xl sm:text-4xl font-normal text-[var(--olive)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Installation
          </h1>
          <p className="text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            A drop-in AI-proof CAPTCHA widget for React. Works like reCAPTCHA v2 — no signup,
            no API key, no backend required. Serves faces hidden in AI-generated images.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {["No signup", "No API key", "Works cross-origin", "Inline CSS, zero deps"].map((tag) => (
              <span
                key={tag}
                className="text-xs px-2.5 py-1 rounded-full bg-[var(--cream-dark)] text-[var(--text-secondary)] border border-[var(--card-border)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </header>

        {/* ── Live demo ── */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Live demo
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Click the widget below to try it — this is the real thing, pulling
            live challenges from our database.
          </p>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 flex flex-col items-center gap-6">
            <LiveDemo />
          </div>
        </section>

        {/* ── Installation ── */}
        <section className="space-y-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Getting started
          </h2>

          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--text-secondary)]">1. Install</p>
            <CodeBlock lang="sh" code={`npm install @latcha/react\n# or\npnpm add @latcha/react`} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--text-secondary)]">2. Add to your form</p>
            <CodeBlock lang="tsx" code={`import { LatchaWidget } from "@latcha/react";

function ContactForm() {
  const [verified, setVerified] = useState(false);

  return (
    <form>
      <input name="email" type="email" placeholder="Email" />
      <textarea name="message" placeholder="Message" />

      {/* CAPTCHA — works exactly like reCAPTCHA v2 */}
      <LatchaWidget
        onVerify={(token) => {
          setVerified(true);
          // Optionally pass token to your backend for server-side re-verification
        }}
        onError={(err) => console.error("CAPTCHA error", err)}
      />

      <button type="submit" disabled={!verified}>
        Send
      </button>
    </form>
  );
}`} />
          </div>
        </section>

        {/* ── Props ── */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Props</h2>
          <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--cream-dark)] border-b border-[var(--card-border)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Prop</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Default</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)] bg-[var(--card-bg)]">
                {[
                  {
                    prop: "onVerify",
                    type: "(token: string) => void",
                    def: "—",
                    desc: "Called on success. token is a short-lived challenge ID.",
                  },
                  {
                    prop: "onError",
                    type: "(err: Error) => void",
                    def: "—",
                    desc: "Called if the network request or API fails.",
                  },
                  {
                    prop: "apiBase",
                    type: "string",
                    def: '"https://latcha.dev/api/latcha"',
                    desc: "Override to self-host the API.",
                  },
                  {
                    prop: "theme",
                    type: '"light" | "dark"',
                    def: '"light"',
                    desc: "Widget color scheme.",
                  },
                ].map((row) => (
                  <tr key={row.prop}>
                    <td className="px-4 py-3 font-mono text-[var(--olive)]">{row.prop}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)] text-xs">{row.type}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-muted)] text-xs">{row.def}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                step: "1",
                title: "Fetch",
                body: "On click, the widget requests a random 3×3 grid of AI-generated images from our servers. Human faces are hidden inside 2–5 of the cells.",
              },
              {
                step: "2",
                title: "Challenge",
                body: "The user selects all cells containing a face. ±1 error is allowed — AIs fail because the faces blend into the scene.",
              },
              {
                step: "3",
                title: "Verify",
                body: "The answer is checked server-side. On success, onVerify is called with a token. No data is collected.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 space-y-2"
              >
                <div className="w-7 h-7 rounded-full bg-[var(--olive)] text-white text-sm font-semibold flex items-center justify-center">
                  {item.step}
                </div>
                <div className="font-medium text-[var(--foreground)]">{item.title}</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.body}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer link ── */}
        <section className="pb-8">
          <a
            href="https://www.npmjs.com/package/@latcha/react"
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
