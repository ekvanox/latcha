export interface ModelConfig {
  id: string;
  name: string;
}

export const EVAL_MODELS: ModelConfig[] = [
  { id: "anthropic/claude-haiku-4.5", name: "Haiku 4.5" },
  { id: "minimax/minimax-01", name: "MiniMax-01" },
  { id: "qwen/qwen3.5-plus-02-15", name: "Qwen 3.5 Plus" },
  { id: "openai/gpt-5-mini", name: "GPT-5 mini" },
  // { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash' },
];
