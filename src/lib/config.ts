/**
 * Local-first configuration.
 *
 * Set LLM_PROVIDER=local in .env.local to use Ollama/vLLM instead of Anthropic.
 * When local, all LLM calls hit the OpenAI-compatible endpoint with zero rate limiting.
 */

export type LLMProvider = "anthropic" | "local";

export interface LLMConfig {
  provider: LLMProvider;
  /** Base URL for local LLM (Ollama or vLLM) */
  localBaseUrl: string;
  /** Model ID for local LLM */
  localModel: string;
  /** Model ID for Anthropic cloud */
  cloudModel: string;
  /** Max concurrent LLM requests — high for local, throttled for cloud */
  llmConcurrency: number;
  /** Delay between LLM requests in ms — 0 for local */
  llmDelayMs: number;
  /** Max concurrent Firecrawl requests */
  firecrawlConcurrency: number;
  /** Delay between Firecrawl requests in ms */
  firecrawlDelayMs: number;
  /** Enrichment batch size — large for local, small for cloud */
  enrichBatchSize: number;
}

export function getLLMConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER || "anthropic") as LLMProvider;
  const isLocal = provider === "local";

  return {
    provider,
    localBaseUrl: process.env.LLM_BASE_URL || "http://localhost:11434",
    localModel: process.env.LLM_MODEL || "qwen3-coder-32b",
    cloudModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    llmConcurrency: isLocal ? 20 : 4,
    llmDelayMs: isLocal ? 0 : 200,
    firecrawlConcurrency: isLocal ? 10 : 5,
    firecrawlDelayMs: isLocal ? 100 : 300,
    enrichBatchSize: isLocal ? 20 : 5,
  };
}
