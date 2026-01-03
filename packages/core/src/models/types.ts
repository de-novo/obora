export interface ModelCost {
  input: number
  output: number
  cache_read?: number
  cache_write?: number
  reasoning?: number
}

export interface ModelLimit {
  context: number
  output: number
}

export interface ModelModalities {
  input: string[]
  output: string[]
}

export interface ModelInfo {
  id: string
  name: string
  family: string
  attachment?: boolean
  reasoning?: boolean
  tool_call?: boolean
  structured_output?: boolean
  temperature?: boolean
  knowledge?: string
  release_date?: string
  last_updated?: string
  modalities?: ModelModalities
  open_weights?: boolean
  cost?: ModelCost
  limit?: ModelLimit
  status?: 'deprecated' | string
}

export interface ProviderInfo {
  id: string
  env?: string[]
  npm?: string
  api?: string
  name: string
  doc?: string
  models: Record<string, ModelInfo>
}

export type ModelsDevData = Record<string, ProviderInfo>

export type SupportedProvider = 'anthropic' | 'openai' | 'google'

export const PROVIDER_MAPPING: Record<SupportedProvider, string[]> = {
  anthropic: ['anthropic', 'google-vertex-anthropic'],
  openai: ['openai', 'github-copilot', 'abacus'],
  google: ['google', 'vercel'],
}

export const DEFAULT_MODELS: Record<SupportedProvider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-5.2',
  google: 'gemini-3-flash-preview',
}
