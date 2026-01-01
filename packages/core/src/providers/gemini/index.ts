import { AISDKBackend } from '../ai-sdk'
import { BaseProvider } from '../BaseProvider'
import type { ProviderBackend, ProviderConfig, ProviderResponse } from '../types'

export interface GeminiProviderConfig extends ProviderConfig {
  model?: 'gemini-2.0-flash' | 'gemini-1.5-pro' | 'gemini-1.5-flash' | string
  /**
   * Enable specific built-in tools for fact-checking during debates
   * Available tools: google_web_search
   * @example enabledTools: ['google_web_search']
   */
  enabledTools?: 'google_web_search'[]
}

/**
 * CLI Backend for Gemini
 * Uses gemini CLI tool (if available)
 *
 * Runs in isolated mode:
 * - No MCP servers (--allowed-mcp-server-names with empty)
 * - No extensions (--extensions with empty)
 */
class GeminiCLIBackend implements ProviderBackend {
  readonly type = 'cli' as const

  async execute(prompt: string, config: GeminiProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now()

    const args = [
      'gemini',
      // Isolation flags - run vanilla without MCP, extensions
      '--allowed-mcp-server-names',
      '',
      '--extensions',
      '',
    ]

    // Enable specific tools if configured
    if (config.enabledTools?.length) {
      args.push('--tools', config.enabledTools.join(','))
    }

    args.push(prompt)

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
      throw new Error(`Gemini CLI failed: ${stderr}`)
    }

    let content = output
    try {
      const json = JSON.parse(output)
      content = json.text || json.content || output
    } catch {
      // Plain text response
    }

    return {
      content,
      raw: output,
      metadata: {
        model: config.model || 'gemini',
        latencyMs: Date.now() - startTime,
        backend: 'cli',
      },
    }
  }

  /**
   * Stream response from Gemini CLI
   */
  async *stream(prompt: string, config: GeminiProviderConfig): AsyncGenerator<{ chunk: string; done: boolean }> {
    const args = ['gemini', '--allowed-mcp-server-names', '', '--extensions', '']

    if (config.enabledTools?.length) {
      args.push('--tools', config.enabledTools.join(','))
    }

    args.push(prompt)

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

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`Gemini CLI streaming failed: ${stderr}`)
    }

    yield { chunk: '', done: true }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['which', 'gemini'], {
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
 * Gemini AI Provider
 *
 * Supports both CLI and API backends:
 * - CLI: Uses 'gemini' command (if available)
 * - API: Uses Vercel AI SDK (@ai-sdk/google)
 *
 * @example
 * // CLI mode (default)
 * const gemini = new GeminiProvider();
 *
 * // API mode
 * const gemini = new GeminiProvider({
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   model: 'gemini-2.0-flash',
 * });
 */
export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini'
  protected declare config: GeminiProviderConfig
  private aiSdkBackend: AISDKBackend
  private cliBackend: GeminiCLIBackend

  constructor(config: GeminiProviderConfig = {}) {
    super(config)
    this.config = config

    // Create backends
    this.cliBackend = new GeminiCLIBackend()
    this.aiSdkBackend = new AISDKBackend('google', config)

    // Register backends (CLI first for fallback, then API)
    this.registerBackend(this.cliBackend)
    this.registerBackend(this.aiSdkBackend)
  }

  /**
   * Stream response chunks
   * Uses API backend if apiKey provided, otherwise CLI backend
   */
  async *stream(prompt: string): AsyncGenerator<{ chunk: string; done: boolean }> {
    if (this.config.apiKey && !this.config.forceCLI) {
      yield* this.aiSdkBackend.stream(prompt, this.config)
    } else {
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
