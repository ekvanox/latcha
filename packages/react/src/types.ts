export interface LatchaWidgetProps {
  /** Called when the user successfully passes the CAPTCHA. token = challengeId, use it server-side to verify if needed. */
  onVerify?: (token: string) => void;
  /** Called on network or API failure */
  onError?: (err: Error) => void;
  /** Override the default API base URL. Default: "https://latcha.dev/api/latcha" */
  apiBase?: string;
  /** Visual theme. Default: "light" */
  theme?: "light" | "dark";
}

export interface ChallengeResponse {
  challengeId: string;
  question: string;
  gridImageUrls: string[];
}

export interface VerifyResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export type WidgetState =
  | "idle"
  | "loading"
  | "challenge"
  | "verifying"
  | "success"
  | "error";
