/**
 * Unified LLM client — supports both Anthropic Cloud and local Ollama/vLLM.
 *
 * When LLM_PROVIDER=local, uses the OpenAI-compatible chat completions endpoint
 * exposed by Ollama (port 11434) or vLLM (port 8000).
 *
 * When LLM_PROVIDER=anthropic (default), uses the Anthropic SDK directly.
 */

import { getLLMConfig } from "./config";

// ─── Anthropic SDK (lazy-loaded only when needed) ───

let anthropicClient: import("@anthropic-ai/sdk").default | null = null;

async function getAnthropicClient() {
  if (!anthropicClient) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  return anthropicClient;
}

async function generateWithAnthropic(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  model: string
): Promise<string> {
  const client = await getAnthropicClient();
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = message.content[0];
  if (block.type === "text") return block.text;
  throw new Error("Unexpected response type from Anthropic");
}

// ─── Local LLM (Ollama native API / vLLM OpenAI-compatible) ───

async function generateWithLocal(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  baseUrl: string,
  model: string
): Promise<string> {
  const isOllama = baseUrl.includes("11434");

  if (isOllama) {
    // Use Ollama native API — supports think:false for qwen3 reasoning models
    const url = `${baseUrl}/api/chat`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        options: { num_predict: maxTokens, temperature: 0.1 },
        think: false,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.message?.content || "";
    if (!content) {
      throw new Error("Empty response from Ollama");
    }
    return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }

  // vLLM / other OpenAI-compatible endpoints
  const url = `${baseUrl}/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Local LLM request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const msg = data.choices?.[0]?.message;
  const content = msg?.content || msg?.reasoning || "";
  if (!content) {
    throw new Error("Empty response from local LLM");
  }
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ─── Batch processing for local LLMs (vLLM PagedAttention optimization) ───

interface BatchRequest {
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}

/**
 * Fire multiple LLM requests in parallel.
 * With local vLLM + PagedAttention, these batch efficiently on the GPU.
 * With Anthropic cloud, concurrency is limited by the rate limiter wrapping this.
 */
export async function generateBatch(
  requests: BatchRequest[]
): Promise<string[]> {
  const config = getLLMConfig();

  if (config.provider === "local") {
    // Fire all at once — vLLM handles batching internally via PagedAttention
    return Promise.all(
      requests.map((req) =>
        generateWithLocal(
          req.systemPrompt,
          req.userMessage,
          req.maxTokens,
          config.localBaseUrl,
          config.localModel
        )
      )
    );
  }

  // Cloud: still parallel but the rate limiter outside will throttle
  return Promise.all(
    requests.map((req) =>
      generateWithAnthropic(
        req.systemPrompt,
        req.userMessage,
        req.maxTokens,
        config.cloudModel
      )
    )
  );
}

// ─── Single request (the main API used by the search pipeline) ───

export async function generateText(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024
): Promise<string> {
  const config = getLLMConfig();

  if (config.provider === "local") {
    return generateWithLocal(
      systemPrompt,
      userMessage,
      maxTokens,
      config.localBaseUrl,
      config.localModel
    );
  }

  return generateWithAnthropic(
    systemPrompt,
    userMessage,
    maxTokens,
    config.cloudModel
  );
}
