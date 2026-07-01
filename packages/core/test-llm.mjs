import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

import { resolveLlmConfig, isLocalProvider } from './src/llm.ts';

function main() {
  let passed = 0, failed = 0;
  function assert(label, ok) { if (ok) passed++; else failed++; const m = ok ? 'log' : 'error'; console[m](`  ${ok ? 'PASS' : 'FAIL'} ${label}`); }

  // ─── Provider presets ──────────────────────────────────────────
  console.log("\n=== Provider presets ===");

  const openai = resolveLlmConfig({ provider: "openai" });
  assert("openai provider string", openai.provider === "openai");
  assert("openai default model", openai.model === "gpt-4o-mini");
  assert("openai endpoint", openai.endpoint === "https://api.openai.com/v1");

  const groq = resolveLlmConfig({ provider: "groq" });
  assert("groq provider string", groq.provider === "groq");
  assert("groq default model", groq.model === "llama-3.1-8b-instant");
  assert("groq endpoint", groq.endpoint === "https://api.groq.com/openai/v1");

  const lmStudio = resolveLlmConfig({ provider: "lm-studio" });
  assert("lm-studio provider", lmStudio.provider === "lm-studio");
  assert("lm-studio default model", lmStudio.model === "local-model");
  assert("lm-studio endpoint", lmStudio.endpoint === "http://localhost:1234/v1");

  const ollama = resolveLlmConfig({ provider: "ollama" });
  assert("ollama provider", ollama.provider === "ollama");
  assert("ollama default model", ollama.model === "llama3.2");
  assert("ollama endpoint", ollama.endpoint === "http://localhost:11434/v1");

  const custom = resolveLlmConfig({ provider: "custom-openai-compatible", endpoint: "https://my-api.example.com/v1", model: "my-model" });
  assert("custom provider", custom.provider === "custom-openai-compatible");
  assert("custom model", custom.model === "my-model");
  assert("custom endpoint", custom.endpoint === "https://my-api.example.com/v1");

  // ─── Overrides ────────────────────────────────────────────────
  console.log("\n=== Overrides ===");

  const overridden = resolveLlmConfig({ provider: "openai", model: "gpt-4o", endpoint: "https://custom.com/v1", apiKey: "sk-test" });
  assert("override model", overridden.model === "gpt-4o");
  assert("override endpoint", overridden.endpoint === "https://custom.com/v1");
  assert("override apiKey", overridden.apiKey === "sk-test");

  // lm-studio doesn't require a key, but if LLM_API_KEY is set in env it still gets applied
  const noKey = resolveLlmConfig({ provider: "lm-studio" });
  assert("lm-studio works without explicit key", typeof noKey.apiKey === "string");

  // ─── Local provider detection ─────────────────────────────────
  console.log("\n=== Local provider detection ===");

  assert("lm-studio is local", isLocalProvider("lm-studio") === true);
  assert("ollama is local", isLocalProvider("ollama") === true);
  assert("openai is not local", isLocalProvider("openai") === false);
  assert("groq is not local", isLocalProvider("groq") === false);

  // ─── Env var integration ─────────────────────────────────────
  console.log("\n=== Env var integration ===");

  // The .env file sets LLM_PROVIDER=groq, LLM_ENDPOINT=..., etc.
  // resolveLlmConfig with no args should pick up those env vars.
  const fromEnv = resolveLlmConfig();
  assert("env: provider is groq", fromEnv.provider === "groq");
  assert("env: endpoint contains groq", fromEnv.endpoint.includes("groq"));
  assert("env: apiKey is non-empty", fromEnv.apiKey.length > 0);
  assert("env: model is llama-3.1-8b-instant", fromEnv.model === "llama-3.1-8b-instant");

  // Partial overrides still fall through to env defaults
  const partial = resolveLlmConfig({ provider: "openai", model: "gpt-4o" });
  assert("partial: model is gpt-4o", partial.model === "gpt-4o");
  assert("partial: provider is openai", partial.provider === "openai");
  // apiKey falls through to env (OPENAI_TOKEN from .env)
  assert("partial: apiKey from env", partial.apiKey.length > 0);
  // endpoint falls through to the preset since we changed provider
  assert("partial: endpoint is openai default", partial.endpoint === "https://api.openai.com/v1");

  // ─── Legacy env var fallbacks ─────────────────────────────────
  console.log("\n=== Legacy env var fallbacks ===");

  // Save env, replace with legacy names, test fallback
  const saved = { LLM_ENDPOINT: process.env.LLM_ENDPOINT, LLM_API_KEY: process.env.LLM_API_KEY, LLM_PROVIDER: process.env.LLM_PROVIDER };
  delete process.env.LLM_ENDPOINT;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_PROVIDER;
  process.env.OPENAI_URL = "https://legacy.example.com/v1";
  process.env.OPENAI_TOKEN = "sk-legacy";

  const legacy = resolveLlmConfig();
  assert("legacy: falls back to OPENAI_URL", legacy.endpoint === "https://legacy.example.com/v1");
  assert("legacy: falls back to OPENAI_TOKEN", legacy.apiKey === "sk-legacy");

  // Restore
  process.env.LLM_ENDPOINT = saved.LLM_ENDPOINT;
  process.env.LLM_API_KEY = saved.LLM_API_KEY;
  process.env.LLM_PROVIDER = saved.LLM_PROVIDER;
  delete process.env.OPENAI_URL;
  delete process.env.OPENAI_TOKEN;

  // ─── Provider detection from URL ──────────────────────────────
  console.log("\n=== Provider detection from URL ===");

  const savedUrl = process.env.LLM_ENDPOINT;
  const savedProvider = process.env.LLM_PROVIDER;
  delete process.env.LLM_ENDPOINT;
  delete process.env.LLM_PROVIDER;
  process.env.OPENAI_URL = "https://api.groq.com/openai/v1";
  const detected = resolveLlmConfig();
  assert("detect groq from URL", detected.provider === "groq");

  process.env.OPENAI_URL = "http://localhost:1234/v1";
  const detectedLocal = resolveLlmConfig();
  assert("detect lm-studio from localhost URL", detectedLocal.provider === "lm-studio");

  process.env.OPENAI_URL = "https://ollama.example.com/v1";
  const detectedOllama = resolveLlmConfig();
  assert("detect ollama from URL containing ollama", detectedOllama.provider === "ollama");

  delete process.env.OPENAI_URL;
  if (savedUrl) process.env.LLM_ENDPOINT = savedUrl;
  if (savedProvider) process.env.LLM_PROVIDER = savedProvider;

  // ─── Final tally ──────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
