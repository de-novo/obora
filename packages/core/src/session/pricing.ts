import type { PricingTable } from './types'

export const DEFAULT_PRICING: PricingTable = {
  anthropic: {
    'claude-sonnet-4-20250514': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
    'claude-3-5-sonnet-20241022': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
    'claude-3-5-sonnet-20240620': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
    'claude-3-5-haiku-20241022': { inputPer1kTokens: 0.0008, outputPer1kTokens: 0.004 },
    'claude-3-opus-20240229': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
    'claude-3-sonnet-20240229': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
    'claude-3-haiku-20240307': { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125 },
  },
  openai: {
    'gpt-4o': { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
    'gpt-4o-2024-11-20': { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
    'gpt-4o-2024-08-06': { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
    'gpt-4o-2024-05-13': { inputPer1kTokens: 0.005, outputPer1kTokens: 0.015 },
    'gpt-4o-mini': { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
    'gpt-4o-mini-2024-07-18': { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
    'gpt-4-turbo': { inputPer1kTokens: 0.01, outputPer1kTokens: 0.03 },
    'gpt-4-turbo-2024-04-09': { inputPer1kTokens: 0.01, outputPer1kTokens: 0.03 },
    'gpt-4': { inputPer1kTokens: 0.03, outputPer1kTokens: 0.06 },
    'gpt-4-32k': { inputPer1kTokens: 0.06, outputPer1kTokens: 0.12 },
    'gpt-3.5-turbo': { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.0015 },
    o1: { inputPer1kTokens: 0.015, outputPer1kTokens: 0.06 },
    'o1-2024-12-17': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.06 },
    'o1-mini': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.012 },
    'o1-mini-2024-09-12': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.012 },
    'o1-preview': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.06 },
    'o1-preview-2024-09-12': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.06 },
    'o3-mini': { inputPer1kTokens: 0.0011, outputPer1kTokens: 0.0044 },
  },
  google: {
    'gemini-2.0-flash': { inputPer1kTokens: 0.0001, outputPer1kTokens: 0.0004 },
    'gemini-2.0-flash-exp': { inputPer1kTokens: 0.0, outputPer1kTokens: 0.0 },
    'gemini-1.5-pro': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
    'gemini-1.5-pro-latest': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
    'gemini-1.5-flash': { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
    'gemini-1.5-flash-latest': { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
    'gemini-1.0-pro': { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.0015 },
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
