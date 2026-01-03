import { AISDKBackend } from '../ai-sdk'
import { AntigravityBackend } from '../antigravity-backend'
import { BaseProvider } from '../BaseProvider'
import type { ProviderBackend, ProviderConfig, ProviderResponse } from '../types'

export interface GeminiProviderConfig extends ProviderConfig {
  model?: 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-2.5-flash' | string
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

  async *stream(
    prompt: string,
    config: GeminiProviderConfig,
  ): AsyncGenerator<{
    chunk: string
    done: boolean
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; model?: string }
  }> {
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

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini'
  protected declare config: GeminiProviderConfig
  private aiSdkBackend: AISDKBackend
  private cliBackend: GeminiCLIBackend
  private antigravityBackend: AntigravityBackend

  constructor(config: GeminiProviderConfig = {}) {
    super(config)
    this.config = config

    this.cliBackend = new GeminiCLIBackend()
    this.aiSdkBackend = new AISDKBackend('google', config)
    this.antigravityBackend = new AntigravityBackend()

    this.registerBackend(this.antigravityBackend)
    this.registerBackend(this.cliBackend)
    this.registerBackend(this.aiSdkBackend)
  }

  async *stream(prompt: string): AsyncGenerator<{ chunk: string; done: boolean }> {
    if (this.config.apiKey && !this.config.forceCLI) {
      yield* this.aiSdkBackend.stream(prompt, this.config)
    } else if (await this.antigravityBackend.isAvailable()) {
      yield* this.antigravityBackend.stream(prompt, this.config)
    } else {
      yield* this.cliBackend.stream(prompt, this.config)
    }
  }

  getModel() {
    return this.aiSdkBackend.getModel(this.config.model)
  }
}
