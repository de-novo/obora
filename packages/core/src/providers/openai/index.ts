import type { Tool } from 'ai'
import { generateText, stepCountIs } from 'ai'
import { AISDKBackend } from '../ai-sdk'
import { BaseProvider } from '../BaseProvider'
import { isOAuthAvailable, OAuthBackend } from '../oauth-backend'
import type {
  ProviderBackend,
  ProviderConfig,
  ProviderResponse,
  ToolEnabledProvider,
  ToolEnabledResponse,
} from '../types'

export interface OpenAIProviderConfig extends ProviderConfig {
  model?: 'gpt-5.2' | 'gpt-5.2-codex' | 'gpt-4o' | 'o1' | string
  /**
   * Enable specific built-in tools for fact-checking during debates
   * Available tools: WebSearch
   * @example enabledTools: ['WebSearch']
   */
  enabledTools?: 'WebSearch'[]
  /**
   * @deprecated Use enabledTools: ['WebSearch'] instead
   */
  enableWebSearch?: boolean
}

/**
 * CLI Backend for OpenAI (Codex)
 * Uses codex CLI tool (headless mode)
 *
 * Runs in isolated mode:
 * - Disable MCP via config (-c mcp.enabled=false)
 * - Skip git repo check for standalone use
 */
class OpenAICLIBackend implements ProviderBackend {
  readonly type = 'cli' as const

  async execute(prompt: string, config: OpenAIProviderConfig): Promise<ProviderResponse> {
    const startTime = Date.now()

    const args = ['codex', 'exec', '-c', 'mcp.enabled=false', '--skip-git-repo-check', '--json']

    if (config.enabledTools?.includes('WebSearch') || config.enableWebSearch) {
      args.push('--search')
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
      throw new Error(`Codex CLI failed: ${stderr}`)
    }

    // Codex outputs JSONL, find agent_message
    const lines = output.trim().split('\n')
    let content = ''

    for (const line of lines) {
      try {
        const json = JSON.parse(line)
        if (json.type === 'item.completed' && json.item?.type === 'agent_message') {
          content = json.item.text || ''
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
    }
  }

  /**
   * Stream response from Codex CLI
   * Parses JSONL output for streaming chunks
   */
  async *stream(prompt: string, config: OpenAIProviderConfig): AsyncGenerator<{ chunk: string; done: boolean }> {
    const args = [
      'codex',
      'exec',
      '-c',
      'mcp.enabled=false',
      '--skip-git-repo-check',
      '--json', // JSONL output for parsing
    ]

    if (config.enabledTools?.includes('WebSearch') || config.enableWebSearch) {
      args.push('--search')
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
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            if (json.type === 'item.completed' && json.item?.type === 'agent_message') {
              const text = json.item.text || ''
              if (text) {
                yield { chunk: text, done: false }
              }
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock()
    }

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`Codex CLI streaming failed: ${stderr}`)
    }

    yield { chunk: '', done: true }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['which', 'codex'], {
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
export class OpenAIProvider extends BaseProvider implements ToolEnabledProvider {
  readonly name = 'openai'
  protected declare config: OpenAIProviderConfig
  private aiSdkBackend: AISDKBackend
  private cliBackend: OpenAICLIBackend
  private oauthBackend: OAuthBackend

  constructor(config: OpenAIProviderConfig = {}) {
    super(config)
    this.config = config

    this.cliBackend = new OpenAICLIBackend()
    this.aiSdkBackend = new AISDKBackend('openai', config)
    this.oauthBackend = new OAuthBackend('openai')

    this.registerBackend(this.cliBackend)
    this.registerBackend(this.aiSdkBackend)
    this.registerBackend(this.oauthBackend)
  }

  override async run(prompt: string): Promise<ProviderResponse> {
    const hasWebSearch = this.config.enabledTools?.includes('WebSearch') || this.config.enableWebSearch

    if (hasWebSearch) {
      if (await this.cliBackend.isAvailable()) {
        return this.cliBackend.execute(prompt, this.config)
      }
      throw new Error('OpenAI WebSearch requires Codex CLI (codex --search). OAuth WebSearch is not supported.')
    }

    return super.run(prompt)
  }

  protected override async getBackend(): Promise<ProviderBackend> {
    if (this.config.forceCLI) {
      const cliBackend = this.backends.get('cli')
      if (cliBackend && (await cliBackend.isAvailable())) {
        return cliBackend
      }
    }

    if (this.config.apiKey) {
      const apiBackend = this.backends.get('api')
      if (apiBackend && (await apiBackend.isAvailable())) {
        return apiBackend
      }
    }

    if (await isOAuthAvailable('openai')) {
      return this.oauthBackend
    }

    const cliBackend = this.backends.get('cli')
    if (cliBackend && (await cliBackend.isAvailable())) {
      return cliBackend
    }

    throw new Error(`No available backend for provider: ${this.name}`)
  }

  async *stream(prompt: string): AsyncGenerator<{ chunk: string; done: boolean }> {
    if (this.config.apiKey && !this.config.forceCLI) {
      yield* this.aiSdkBackend.stream(prompt, this.config)
    } else if (await isOAuthAvailable('openai')) {
      yield* this.oauthBackend.stream(prompt, this.config)
    } else {
      yield* this.cliBackend.stream(prompt, this.config)
    }
  }

  getModel() {
    return this.aiSdkBackend.getModel(this.config.model)
  }

  async runWithTools(prompt: string, tools: Record<string, Tool>): Promise<ToolEnabledResponse> {
    if (await isOAuthAvailable('openai')) {
      return this.oauthBackend.runWithTools(prompt, tools, this.config)
    }

    const startTime = Date.now()
    const model = this.getModel()

    const { text, toolResults, usage } = await generateText({
      model,
      messages: [{ role: 'user', content: prompt }],
      tools,
      stopWhen: stepCountIs(5),
    })

    return {
      content: text,
      toolCalls: toolResults?.map((tr) => ({
        toolName: tr.toolName,
        args: tr.input as Record<string, unknown>,
        result: tr.output,
      })),
      metadata: {
        model: this.config.model || 'gpt-5.2',
        tokensUsed: usage?.totalTokens,
        latencyMs: Date.now() - startTime,
        backend: 'api',
      },
    }
  }
}
