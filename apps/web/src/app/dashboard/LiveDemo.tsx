"use client";

import { useState } from "react";
import { LatchaWidget } from "@latcha/react";

export function LiveDemo() {
  const [token, setToken] = useState<string | null>(null);

  const handleVerify = (t: string) => {
    setToken(t);
  };

  const handleReset = () => {
    setToken(null);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <LatchaWidget onVerify={handleVerify} />

      {token && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="text-[#2d5a1b] font-medium">✓ Verified</span>
            {" — your form would submit here."}
          </p>
          <p className="text-xs text-[var(--text-muted)] font-mono break-all max-w-xs">
            token: {token}
          </p>
          <button
            onClick={handleReset}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--olive)] underline transition-colors"
          >
            Reset demo
          </button>
        </div>
      )}
    </div>
  );
}
