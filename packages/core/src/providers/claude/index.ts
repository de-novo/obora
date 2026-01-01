import { BaseProvider } from '../BaseProvider';
import type { ProviderBackend, ProviderConfig, ProviderResponse, StructuredProvider } from '../types';
import { AISDKBackend } from '../ai-sdk';

export interface ClaudeProviderConfig extends ProviderConfig {
  model?: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514' | 'claude-haiku-3-20250514' | string;
}

/**
 * CLI Backend for Claude
 * Uses claude CLI tool (headless mode)
 *
 * Runs in isolated mode:
 * - No MCP servers (--strict-mcp-config with no config)
 * - No skills/slash commands (--disable-slash-commands)
 * - No tools (--tools "")
 * - No user/project settings (--setting-sources "")
 */
class ClaudeCLIBackend implements ProviderBackend {
  readonly type = 'cli' as const;

  async execute(prompt: string, config: ClaudeProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now();

    const args = [
      'claude',
      '-p', prompt,
      '--output-format', 'json',
      // Isolation flags - run vanilla without MCP, skills, rules
      '--tools', '',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--setting-sources', '',
    ];

    if (config.model) {
      args.push('--model', config.model);
    }

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Claude CLI failed: ${stderr}`);
    }

    const json = JSON.parse(output);

    return {
      content: json.result || '',
      raw: json,
      metadata: {
        model: config.model || 'default',
        latencyMs: Date.now() - startTime,
        backend: 'cli',
      },
    };
  }

  async executeStructured<T>(prompt: string, schema: object, config: ClaudeProviderConfig): Promise<T> {
    const args = [
      'claude',
      '-p', prompt,
      '--output-format', 'json',
      '--json-schema', JSON.stringify(schema),
      // Isolation flags - run vanilla without MCP, skills, rules
      '--tools', '',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--setting-sources', '',
    ];

    if (config.model) {
      args.push('--model', config.model);
    }

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Claude CLI structured failed: ${stderr}`);
    }

    const json = JSON.parse(output);
    return json.structured_output as T;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['which', 'claude'], {
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
 * Claude AI Provider
 *
 * Supports both CLI and API backends:
 * - CLI: Uses 'claude' command (headless mode)
 * - API: Uses Vercel AI SDK (@ai-sdk/anthropic)
 *
 * @example
 * // CLI mode (default)
 * const claude = new ClaudeProvider();
 *
 * // API mode
 * const claude = new ClaudeProvider({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   model: 'claude-sonnet-4-20250514',
 * });
 */
export class ClaudeProvider extends BaseProvider implements StructuredProvider {
  readonly name = 'claude';
  protected declare config: ClaudeProviderConfig;
  private aiSdkBackend: AISDKBackend;

  constructor(config: ClaudeProviderConfig = {}) {
    super(config);
    this.config = config;

    // Create AI SDK backend
    this.aiSdkBackend = new AISDKBackend('anthropic', config);

    // Register backends (CLI first for fallback, then API)
    this.registerBackend(new ClaudeCLIBackend());
    this.registerBackend(this.aiSdkBackend);
  }

  async runStructured<T>(prompt: string, schema: object): Promise<T> {
    const backend = await this.getBackend();

    if (backend.executeStructured) {
      return backend.executeStructured<T>(prompt, schema, this.config);
    }

    throw new Error('Structured output not supported by current backend');
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
