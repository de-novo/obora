/**
 * Configuration Loader
 *
 * Loads configuration from YAML files and environment variables.
 * Supports multiple configuration sources with merging.
 */

import { parse } from 'yaml'
import type { ConfigLoaderOptions, OboraConfig, ProviderSettings } from './types'
import { DEFAULT_CONFIG } from './types'

/**
 * Load configuration from a YAML file
 */
export async function loadConfigFromFile(path: string): Promise<Partial<OboraConfig>> {
  const file = Bun.file(path)

  if (!(await file.exists())) {
    throw new Error(`Configuration file not found: ${path}`)
  }

  const content = await file.text()
  const raw = parse(content) as Record<string, unknown>

  return normalizeConfig(raw)
}

/**
 * Load provider settings from environment variables
 */
export function loadConfigFromEnv(
  env: Record<string, string> = process.env as Record<string, string>,
): Partial<OboraConfig> {
  const providers: Record<string, ProviderSettings> = {}

  // Claude
  if (env.ANTHROPIC_API_KEY) {
    providers.claude = {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
      baseUrl: env.ANTHROPIC_BASE_URL,
    }
  }

  // OpenAI
  if (env.OPENAI_API_KEY) {
    providers.openai = {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      baseUrl: env.OPENAI_BASE_URL,
    }
  }

  // Gemini
  if (env.GOOGLE_API_KEY || env.GEMINI_API_KEY) {
    providers.gemini = {
      apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    }
  }

  return { providers }
}

/**
 * Load configuration with defaults, file, and environment merging
 */
export async function loadConfig(options: ConfigLoaderOptions = {}): Promise<OboraConfig> {
  let config: OboraConfig = { ...DEFAULT_CONFIG }

  // Load from file if path provided
  if (options.path) {
    const fileConfig = await loadConfigFromFile(options.path)
    config = mergeConfig(config, fileConfig)
  }

  // Load from environment
  const envConfig = loadConfigFromEnv(options.env)
  config = mergeConfig(config, envConfig)

  return config
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): OboraConfig {
  return { ...DEFAULT_CONFIG }
}

/**
 * Normalize raw config from YAML to typed config
 */
function normalizeConfig(raw: Record<string, unknown>): Partial<OboraConfig> {
  const config: Partial<OboraConfig> = {}

  if (raw.orchestrator && typeof raw.orchestrator === 'object') {
    const orch = raw.orchestrator as Record<string, unknown>
    config.orchestrator = {
      ai: (orch.ai as string) || 'claude',
    }
  }

  if (Array.isArray(raw.participants)) {
    config.participants = raw.participants as string[]
  }

  if (raw.settings && typeof raw.settings === 'object') {
    const settings = raw.settings as Record<string, unknown>
    config.settings = {
      maxRounds: (settings.max_rounds as number) || (settings.maxRounds as number) || 10,
      timeout: (settings.timeout as number) || 300,
    }
  }

  if (raw.providers && typeof raw.providers === 'object') {
    config.providers = raw.providers as Record<string, ProviderSettings>
  }

  return config
}

/**
 * Deep merge two configurations
 */
function mergeConfig(base: OboraConfig, override: Partial<OboraConfig>): OboraConfig {
  return {
    orchestrator: override.orchestrator ? { ...base.orchestrator, ...override.orchestrator } : base.orchestrator,
    participants: override.participants || base.participants,
    settings: override.settings ? { ...base.settings, ...override.settings } : base.settings,
    providers: {
      ...base.providers,
      ...override.providers,
    },
  }
}
