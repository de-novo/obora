import { createHash } from "node:crypto";

import type { LLMAdapterLike } from "../step-executor.js";
import type { LLMConfig } from "../llm-config.js";

/**
 * AdapterResolver provides a per-execution LLM adapter cache.
 *
 * Usage:
 *   const resolver = new AdapterResolver(runtime.createLLMAdapter.bind(runtime));
 *   const adapter  = await resolver.get(llmConfig);
 *
 * The same adapter instance is reused across steps within the same execution
 * when provider / model / baseUrl / apiKey all match.
 */
export class AdapterResolver {
  private readonly cache = new Map<string, LLMAdapterLike>();

  constructor(
    private readonly adapterFactory: (config: LLMConfig) => Promise<LLMAdapterLike>,
  ) {}

  async get(cfg: LLMConfig): Promise<LLMAdapterLike> {
    const apiKeyHash = createHash("sha256").update(cfg.apiKey).digest("hex").slice(0, 16);
    const cacheKey = `${cfg.provider}:${cfg.model ?? ""}:${cfg.baseUrl ?? ""}:${apiKeyHash}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const adapter = await this.adapterFactory(cfg);
    this.cache.set(cacheKey, adapter);
    return adapter;
  }
}
