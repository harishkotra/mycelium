export type LlmProvider =
  "openai" | "groq" | "lm-studio" | "ollama" | "custom-openai-compatible";

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  endpoint: string;
  /** Optional — only needed for Azure / versioned endpoints. */
  apiVersion?: string;
}

export interface LlmConfigInput {
  provider?: LlmProvider;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  apiVersion?: string;
}

interface ProviderPreset {
  endpoint: string;
  defaultModel: string;
  requiresKey: boolean;
}

export const PROVIDER_PRESETS: Record<LlmProvider, ProviderPreset> = {
  openai: {
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    requiresKey: true,
  },
  groq: {
    endpoint: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-8b-instant",
    requiresKey: true,
  },
  "lm-studio": {
    endpoint: "http://localhost:1234/v1",
    defaultModel: "local-model",
    requiresKey: false,
  },
  ollama: {
    endpoint: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    requiresKey: false,
  },
  "custom-openai-compatible": {
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    requiresKey: false,
  },
};

/**
 * Resolve the effective LLM config from a partial input, env vars, and
 * provider presets. Precedence: explicit input > env vars > presets > hard defaults.
 *
 * Env vars (all optional):
 *   LLM_PROVIDER  — one of "openai" | "groq" | "lm-studio" | "ollama" | "custom-openai-compatible"
 *   LLM_ENDPOINT  — OpenAI-compatible base URL
 *   LLM_API_KEY   — API key (not needed for LM Studio / Ollama)
 *   LLM_MODEL     — model name
 *
 * Legacy aliases (fallback if LLM_ENDPOINT / LLM_API_KEY not set):
 *   OPENAI_URL    → LLM_ENDPOINT
 *   OPENAI_TOKEN  → LLM_API_KEY
 */
export function resolveLlmConfig(input?: LlmConfigInput): LlmConfig {
  const provider =
    input?.provider ??
    (process.env["LLM_PROVIDER"] as LlmProvider | undefined) ??
    detectProviderFromEnv() ??
    "openai";

  const preset = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS["openai"];

  // When the user explicitly passes a provider we trust their choice and use
  // the preset's defaults, ignoring env vars (which might be for a different
  // provider).  When no provider was passed we fall back to env vars.
  const explicit = !!input?.provider;

  const endpoint = explicit
    ? (input?.endpoint ?? preset.endpoint)
    : (input?.endpoint ??
      process.env["LLM_ENDPOINT"] ??
      process.env["OPENAI_URL"] ??
      preset.endpoint);

  const model = explicit
    ? (input?.model ?? preset.defaultModel)
    : (input?.model ?? process.env["LLM_MODEL"] ?? preset.defaultModel);

  const apiKey =
    input?.apiKey ??
    process.env["LLM_API_KEY"] ??
    process.env["OPENAI_TOKEN"] ??
    "";

  return {
    provider,
    model,
    apiKey,
    endpoint,
    apiVersion: input?.apiVersion ?? process.env["LLM_API_VERSION"],
  };
}

/**
 * Try to guess the provider from the endpoint URL.
 */
function detectProviderFromEnv(): LlmProvider | null {
  const url = process.env["LLM_ENDPOINT"] ?? process.env["OPENAI_URL"] ?? "";
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("groq")) return "groq";
  if (u.includes("ollama")) return "ollama";
  if (u.includes("localhost") || u.includes("127.0.0.1")) return "lm-studio";
  return null;
}

/**
 * Quick check — is the provider a local one that probably doesn't need a key?
 */
export function isLocalProvider(provider: LlmProvider): boolean {
  return provider === "lm-studio" || provider === "ollama";
}
