import type { PricingTable } from './types'

export const DEFAULT_PRICING: PricingTable = {
  anthropic: {
    'claude-opus-4-5-20251101': { inputPer1kTokens: 0.005, outputPer1kTokens: 0.025 },
    'claude-sonnet-4-5-20250929': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
    'claude-haiku-4-5-20251001': { inputPer1kTokens: 0.001, outputPer1kTokens: 0.005 },
    'claude-opus-4-1-20250805': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
    'claude-sonnet-4-20250514': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
    'claude-3-7-sonnet-20250219': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
    'claude-3-5-sonnet-20241022': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
    'claude-3-5-haiku-20241022': { inputPer1kTokens: 0.0008, outputPer1kTokens: 0.004 },
    'claude-3-opus-20240229': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
  },
  openai: {
    'gpt-5.2': { inputPer1kTokens: 0.00175, outputPer1kTokens: 0.014 },
    'gpt-5.1': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.01 },
    'gpt-5': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.01 },
    'gpt-5-mini': { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.002 },
    'gpt-5-nano': { inputPer1kTokens: 0.00005, outputPer1kTokens: 0.0004 },
    'gpt-4.1': { inputPer1kTokens: 0.002, outputPer1kTokens: 0.008 },
    'gpt-4.1-mini': { inputPer1kTokens: 0.0004, outputPer1kTokens: 0.0016 },
    'gpt-4.1-nano': { inputPer1kTokens: 0.0001, outputPer1kTokens: 0.0004 },
    o3: { inputPer1kTokens: 0.002, outputPer1kTokens: 0.008 },
    'o3-mini': { inputPer1kTokens: 0.0011, outputPer1kTokens: 0.0044 },
    'o4-mini': { inputPer1kTokens: 0.0011, outputPer1kTokens: 0.0044 },
    'gpt-4o': { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
    'gpt-4o-mini': { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
  },
  google: {
    'gemini-3-pro-preview': { inputPer1kTokens: 0.002, outputPer1kTokens: 0.012 },
    'gemini-3-flash-preview': { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.003 },
    'gemini-2.5-pro': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.01 },
    'gemini-2.5-flash': { inputPer1kTokens: 0.0003, outputPer1kTokens: 0.0025 },
    'gemini-2.5-flash-lite': { inputPer1kTokens: 0.0001, outputPer1kTokens: 0.0004 },
    'gemini-2.0-flash': { inputPer1kTokens: 0.0001, outputPer1kTokens: 0.0004 },
    'gemini-1.5-pro': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
  },
}

export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  pricing: PricingTable = DEFAULT_PRICING,
): number | null {
  const providerPricing = pricing[provider.toLowerCase()]
  if (!providerPricing) return null

  const modelPricing = providerPricing[model] || providerPricing[model.toLowerCase()]
  if (!modelPricing) return null

  const inputCost = (inputTokens / 1000) * modelPricing.inputPer1kTokens
  const outputCost = (outputTokens / 1000) * modelPricing.outputPer1kTokens

  return inputCost + outputCost
}

export function findModelPricing(
  provider: string,
  model: string,
  pricing: PricingTable = DEFAULT_PRICING,
): { inputPer1kTokens: number; outputPer1kTokens: number } | null {
  const providerPricing = pricing[provider.toLowerCase()]
  if (!providerPricing) return null

  const exactMatch = providerPricing[model]
  if (exactMatch) return exactMatch

  const lowerMatch = providerPricing[model.toLowerCase()]
  if (lowerMatch) return lowerMatch

  for (const [key, value] of Object.entries(providerPricing)) {
    if (model.startsWith(key) || model.includes(key)) {
      return value
    }
  }

  return null
}
