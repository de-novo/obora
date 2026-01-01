import { BaseProvider } from '../BaseProvider';
import type { ProviderBackend, ProviderConfig, ProviderResponse } from '../types';
import { AISDKBackend } from '../ai-sdk';

export interface OpenAIProviderConfig extends ProviderConfig {
  model?: 'gpt-4o' | 'gpt-4o-mini' | 'o1' | 'o1-mini' | string;
}

/**
 * CLI Backend for OpenAI (Codex)
 * Uses codex CLI tool (headless mode)
 */
class OpenAICLIBackend implements ProviderBackend {
  readonly type = 'cli' as const;

  async execute(prompt: string, config: OpenAIProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now();

    const proc = Bun.spawn(['codex', 'exec', prompt, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Codex CLI failed: ${stderr}`);
    }

    // Codex outputs JSONL, find agent_message
    const lines = output.trim().split('\n');
    let content = '';

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'item.completed' && json.item?.type === 'agent_message') {
          content = json.item.text || '';
        }
      } catch {
        // skip non-JSON lines
      }
    }

    return {
      content,
      raw: output,
      metadata: {
        model: config.model || 'codex',
        latencyMs: Date.now() - startTime,
        backend: 'cli',
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['which', 'codex'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return (await proc.exited) === 0;
    } catch {
      return false;
    }
  }
}

/**
 * OpenAI Provider
 *
 * Supports both CLI and API backends:
 * - CLI: Uses 'codex' command (headless mode)
 * - API: Uses Vercel AI SDK (@ai-sdk/openai)
 *
 * @example
 * // CLI mode (default)
 * const openai = new OpenAIProvider();
 *
 * // API mode
 * const openai = new OpenAIProvider({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4o',
 * });
 */
export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  protected declare config: OpenAIProviderConfig;
  private aiSdkBackend: AISDKBackend;

  constructor(config: OpenAIProviderConfig = {}) {
    super(config);
    this.config = config;

    // Create AI SDK backend
    this.aiSdkBackend = new AISDKBackend('openai', config);

    // Register backends (CLI first for fallback, then API)
    this.registerBackend(new OpenAICLIBackend());
    this.registerBackend(this.aiSdkBackend);
  }

  /**
   * Stream response chunks
   */
  async *stream(prompt: string): AsyncGenerator<{ chunk: string; done: boolean }> {
    yield* this.aiSdkBackend.stream(prompt, this.config);
  }

  /**
   * Get the underlying AI SDK model for advanced usage
   */
  getModel() {
    return this.aiSdkBackend.getModel(this.config.model);
  }
}
