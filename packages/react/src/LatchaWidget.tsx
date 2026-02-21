"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { CaptchaGrid } from "./CaptchaGrid.js";
import type {
  LatchaWidgetProps,
  ChallengeResponse,
  VerifyResponse,
  WidgetState,
} from "./types.js";

const DEFAULT_API_BASE = "https://latcha.dev/api/latcha";

// ── Inject keyframe CSS once ─────────────────────────────────────────────────
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
@keyframes lw-spin {
  to { transform: rotate(360deg); }
}
@keyframes lw-pop {
  0%   { transform: scale(0.85); opacity: 0; }
  60%  { transform: scale(1.04); }
  100% { transform: scale(1);    opacity: 1; }
}
@keyframes lw-check {
  0%   { stroke-dashoffset: 24; }
  100% { stroke-dashoffset: 0; }
}
.lw-checkbox-border {
  transition: border-color 0.2s ease, background 0.2s ease;
}
.lw-idle-card:hover .lw-checkbox-border {
  border-color: #3d5a1e !important;
}
.lw-cell-btn:hover .lw-cell-hover {
  opacity: 1;
}
`;
  document.head.appendChild(style);
}

// ── Checkbox SVG states ───────────────────────────────────────────────────────
function CheckboxEmpty({ spinning }: { spinning?: boolean }) {
  return (
    <div
      className="lw-checkbox-border"
      style={{
        width: 28,
        height: 28,
        border: "2px solid #c8c2b6",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {spinning && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              border: "2px solid #e8e2d6",
              borderTopColor: "#3d5a1e",
              borderRadius: "50%",
              animation: "lw-spin 0.7s linear infinite",
            }}
          />
        </div>
      )}
    </div>
  );
}

function CheckboxChecked() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        border: "2px solid #3d5a1e",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: "#3d5a1e",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline
          points="20 6 9 17 4 12"
          strokeDasharray="24"
          strokeDashoffset="0"
          style={{ animation: "lw-check 0.25s ease-out forwards" }}
        />
      </svg>
    </div>
  );
}

// ── Latcha brand mark ─────────────────────────────────────────────────────────
function LatchaBrand() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        userSelect: "none",
      }}
    >
      {/* Simple leaf SVG as logo mark */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="16" cy="16" r="15" fill="#f5f0e8" stroke="#e8e2d6" />
        <path
          d="M16 6 C8 8 6 16 10 22 C12 25 16 26 16 26 C16 26 20 25 22 22 C26 16 24 8 16 6Z"
          fill="#3d5a1e"
          opacity="0.85"
        />
        <line x1="16" y1="10" x2="16" y2="25" stroke="#f5f0e8" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: "#8a8478",
          letterSpacing: "0.05em",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        latcha
      </span>
      <span
        style={{
          fontSize: 8,
          color: "#b0aa9e",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Privacy - Terms
      </span>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export function LatchaWidget({
  onVerify,
  onError,
  apiBase = DEFAULT_API_BASE,
  theme = "light",
}: LatchaWidgetProps) {
  const [state, setState] = useState<WidgetState>("idle");
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    injectStyles();
  }, []);

  const fetchChallenge = useCallback(async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${apiBase}/challenge`);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ChallengeResponse;
      setChallenge(data);
      setState("challenge");
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to load challenge");
      setErrorMsg(error.message);
      setState("error");
      onError?.(error);
    }
  }, [apiBase, onError]);

  const handleSubmit = useCallback(
    async (selectedCells: number[]) => {
      if (!challenge) return;
      setState("verifying");
      try {
        const res = await fetch(`${apiBase}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            selectedCells,
          }),
        });
        const data = (await res.json()) as VerifyResponse;
        if (data.success) {
          setState("success");
          onVerify?.(data.token ?? challenge.challengeId);
        } else {
          // Wrong answer — let user retry with a fresh challenge
          setErrorMsg("Incorrect — please try again.");
          setState("error");
        }
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Verification failed");
        setErrorMsg(error.message);
        setState("error");
        onError?.(error);
      }
    },
    [apiBase, challenge, onVerify, onError],
  );

  const handleSkip = useCallback(() => {
    // Give a fresh challenge
    setChallenge(null);
    fetchChallenge();
  }, [fetchChallenge]);

  const handleReset = useCallback(() => {
    setChallenge(null);
    setErrorMsg("");
    setState("idle");
  }, []);

  const isDark = theme === "dark";
  const cardBg = isDark ? "#1e2a14" : "#fff";
  const cardBorder = isDark ? "#3d5a1e" : "#e8e2d6";
  const textColor = isDark ? "#f5f0e8" : "#3d5a1e";
  const mutedColor = isDark ? "#a0a896" : "#8a8478";

  // Idle / success card (reCAPTCHA-like compact bar)
  const showCompactCard = state === "idle" || state === "loading" || state === "success";

  return (
    <div
      ref={containerRef}
      style={{
        display: "inline-block",
        fontFamily: "system-ui, -apple-system, sans-serif",
        width: showCompactCard ? 300 : 310,
        transition: "width 0.2s ease",
      }}
    >
      {/* ── Compact idle/success card ── */}
      {showCompactCard && (
        <div
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 8,
            padding: "16px 20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            cursor: state === "idle" ? "pointer" : "default",
            animation: "lw-pop 0.2s ease-out",
            userSelect: "none",
          }}
          className="lw-idle-card"
          onClick={state === "idle" ? fetchChallenge : undefined}
          role={state === "idle" ? "button" : undefined}
          tabIndex={state === "idle" ? 0 : undefined}
          onKeyDown={
            state === "idle"
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fetchChallenge();
                  }
                }
              : undefined
          }
          aria-label={state === "idle" ? "I am not a robot" : undefined}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {state === "loading" ? (
              <CheckboxEmpty spinning />
            ) : state === "success" ? (
              <CheckboxChecked />
            ) : (
              <CheckboxEmpty />
            )}
            <span
              style={{
                fontSize: 15,
                color: textColor,
                fontWeight: 400,
              }}
            >
              {state === "success" ? "Verified" : "I'm not a robot"}
            </span>
          </div>
          <LatchaBrand />
        </div>
      )}

      {/* ── Challenge grid ── */}
      {(state === "challenge" || state === "verifying") && challenge && (
        <div
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
            animation: "lw-pop 0.2s ease-out",
          }}
        >
          <CaptchaGrid
            imageUrls={challenge.gridImageUrls}
            question={challenge.question}
            onSubmit={handleSubmit}
            onSkip={handleSkip}
            disabled={state === "verifying"}
          />
        </div>
      )}

      {/* ── Error state ── */}
      {state === "error" && (
        <div
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 8,
            padding: "16px 20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            animation: "lw-pop 0.2s ease-out",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              color: "#c0392b",
            }}
          >
            {errorMsg || "Something went wrong."}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={fetchChallenge}
              style={{
                flex: 1,
                padding: "7px 12px",
                background: "#3d5a1e",
                color: "#fff",
                border: "none",
                borderRadius: 5,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Try again
            </button>
            <button
              onClick={handleReset}
              style={{
                flex: 1,
                padding: "7px 12px",
                background: "transparent",
                color: mutedColor,
                border: `1px solid ${cardBorder}`,
                borderRadius: 5,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
