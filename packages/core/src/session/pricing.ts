import { fetchModels } from '../models/fetcher'
import type { ModelsDevData, SupportedProvider } from '../models/types'

const PROVIDER_MAP: Record<SupportedProvider, string[]> = {
  anthropic: ['anthropic', 'google-vertex-anthropic'],
  openai: ['openai', 'github-copilot', 'abacus'],
  google: ['google', 'vercel'],
}

let cachedData: ModelsDevData | null = null

export async function preloadPricing(): Promise<void> {
  cachedData = await fetchModels()
}

function findModelCost(
  data: ModelsDevData,
  provider: SupportedProvider,
  modelId: string,
): { input: number; output: number } | null {
  const providerIds = PROVIDER_MAP[provider]
  if (!providerIds) return null

  for (const providerId of providerIds) {
    const providerData = data[providerId]
    if (!providerData?.models) continue

    const modelInfo = providerData.models[modelId]
    if (modelInfo?.cost) {
      return { input: modelInfo.cost.input, output: modelInfo.cost.output }
    }

    for (const [id, info] of Object.entries(providerData.models)) {
      if (id.includes(modelId) || modelId.includes(id)) {
        if (info.cost) {
          return { input: info.cost.input, output: info.cost.output }
        }
      }
    }
  }
  return null
}

export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!cachedData) return null

  const pricing = findModelCost(cachedData, provider as SupportedProvider, model)
  if (!pricing) return null

  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

export async function estimateCostAsync(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number | null> {
  if (!cachedData) {
    try {
      cachedData = await fetchModels()
    } catch {
      return null
    }
  }
  return estimateCost(provider, model, inputTokens, outputTokens)
}
