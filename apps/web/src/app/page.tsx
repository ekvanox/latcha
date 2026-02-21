import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 font-[family-name:var(--font-geist-sans)]">
      <main className="max-w-2xl text-center space-y-8">
        <h1 className="text-6xl font-bold tracking-tight">Lacha</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          LLM-Proof CAPTCHA — challenges that are trivially easy for humans but
          impossible for frontier AI models.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/demo"
            className="px-6 py-3 bg-black text-white dark:bg-white dark:text-black rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            Start Captcha Test
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            View Dashboard →
          </Link>
        </div>
        <div className="mt-12 text-sm text-gray-500 space-y-2">
          <p>Current CAPTCHAs are broken — AI solves them at 90-100% rates.</p>
          <p>
            Lacha exploits documented perceptual gaps where humans score 85-100%
            while frontier LLMs score 0-5%.
          </p>
        </div>
      </main>
    </div>
  );
}
