import { AISDKBackend } from '../ai-sdk'
import { BaseProvider } from '../BaseProvider'
import type { ProviderBackend, ProviderConfig, ProviderResponse, StructuredProvider } from '../types'

export interface ClaudeProviderConfig extends ProviderConfig {
  model?: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514' | 'claude-haiku-3-20250514' | string
  /**
   * Enable specific built-in tools for fact-checking during debates
   * Available tools: WebSearch, WebFetch
   * @example enabledTools: ['WebSearch', 'WebFetch']
   */
  enabledTools?: ('WebSearch' | 'WebFetch')[]
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
  readonly type = 'cli' as const

  async execute(prompt: string, config: ClaudeProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now()

    // Build tools flag - empty string disables all, or list specific tools
    const toolsValue = config.enabledTools?.length ? config.enabledTools.join(',') : ''

    const args = [
      'claude',
      '-p',
      prompt,
      '--output-format',
      'json',
      // Isolation flags - run vanilla without MCP, skills, rules
      '--tools',
      toolsValue,
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--setting-sources',
      '',
    ]

    if (config.model) {
      args.push('--model', config.model)
    }

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`Claude CLI failed: ${stderr}`)
    }

    const json = JSON.parse(output)

    return {
      content: json.result || '',
      raw: json,
      metadata: {
        model: config.model || 'default',
        latencyMs: Date.now() - startTime,
        backend: 'cli',
      },
    }
  }

  async executeStructured<T>(prompt: string, schema: object, config: ClaudeProviderConfig): Promise<T> {
    // Build tools flag - empty string disables all, or list specific tools
    const toolsValue = config.enabledTools?.length ? config.enabledTools.join(',') : ''

    const args = [
      'claude',
      '-p',
      prompt,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      // Isolation flags - run vanilla without MCP, skills, rules
      '--tools',
      toolsValue,
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--setting-sources',
      '',
    ]

    if (config.model) {
      args.push('--model', config.model)
    }

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`Claude CLI structured failed: ${stderr}`)
    }

    const json = JSON.parse(output)
    return json.structured_output as T
  }

  /**
   * Stream response from CLI
   * Uses claude -p without --output-format json for streaming
   */
  async *stream(prompt: string, config: ClaudeProviderConfig): AsyncGenerator<{ chunk: string; done: boolean }> {
    // Build tools flag
    const toolsValue = config.enabledTools?.length ? config.enabledTools.join(',') : ''

    const args = [
      'claude',
      '-p',
      prompt,
      // No --output-format json for streaming plain text
      '--tools',
      toolsValue,
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--setting-sources',
      '',
    ]

    if (config.model) {
      args.push('--model', config.model)
    }

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        if (chunk) {
          yield { chunk, done: false }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Check for errors
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`Claude CLI streaming failed: ${stderr}`)
    }

    yield { chunk: '', done: true }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['which', 'claude'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      return (await proc.exited) === 0
    } catch {
      return false
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
  readonly name = 'claude'
  protected declare config: ClaudeProviderConfig
  private aiSdkBackend: AISDKBackend
  private cliBackend: ClaudeCLIBackend

  constructor(config: ClaudeProviderConfig = {}) {
    super(config)
    this.config = config

    // Create backends
    this.cliBackend = new ClaudeCLIBackend()
    this.aiSdkBackend = new AISDKBackend('anthropic', config)

    // Register backends (CLI first for fallback, then API)
    this.registerBackend(this.cliBackend)
    this.registerBackend(this.aiSdkBackend)
  }

  async runStructured<T>(prompt: string, schema: object): Promise<T> {
    const backend = await this.getBackend()

    if (backend.executeStructured) {
      return backend.executeStructured<T>(prompt, schema, this.config)
    }

    throw new Error('Structured output not supported by current backend')
  }

  /**
   * Stream response chunks
   * Uses API backend if apiKey provided, otherwise CLI backend
   */
  async *stream(prompt: string): AsyncGenerator<{ chunk: string; done: boolean }> {
    // Use API if apiKey provided and not forcing CLI
    if (this.config.apiKey && !this.config.forceCLI) {
      yield* this.aiSdkBackend.stream(prompt, this.config)
    } else {
      // Use CLI streaming
      yield* this.cliBackend.stream(prompt, this.config)
    }
  }

  /**
   * Get the underlying AI SDK model for advanced usage
   */
  getModel() {
    return this.aiSdkBackend.getModel(this.config.model)
  }
}
