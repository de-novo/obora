import { join } from 'node:path'
import type { ModelsDevData } from './types'

const MODELS_DEV_URL = 'https://models.dev/api.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CacheEntry {
  data: ModelsDevData
  timestamp: number
}

let memoryCache: CacheEntry | null = null

function getCacheDir(): string {
  return join(process.env.HOME || '~', '.config', 'obora', 'cache')
}

function getCachePath(): string {
  return join(getCacheDir(), 'models.json')
}

async function readFileCache(): Promise<CacheEntry | null> {
  try {
    const file = Bun.file(getCachePath())
    if (!(await file.exists())) return null
    const content = await file.json()
    return content as CacheEntry
  } catch {
    return null
  }
}

async function writeFileCache(entry: CacheEntry): Promise<void> {
  try {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(getCacheDir(), { recursive: true })
    await Bun.write(getCachePath(), JSON.stringify(entry))
  } catch {
    // Silently fail - cache is optional
  }
}

function isCacheValid(entry: CacheEntry | null): entry is CacheEntry {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL_MS
}

async function fetchFromApi(): Promise<ModelsDevData> {
  const response = await fetch(MODELS_DEV_URL, {
    headers: { 'User-Agent': 'obora/1.0' },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev: ${response.status}`)
  }
  return response.json() as Promise<ModelsDevData>
}

export async function fetchModels(options?: { forceRefresh?: boolean }): Promise<ModelsDevData> {
  if (!options?.forceRefresh && isCacheValid(memoryCache)) {
    return memoryCache.data
  }

  const fileCache = await readFileCache()
  if (!options?.forceRefresh && isCacheValid(fileCache)) {
    memoryCache = fileCache
    return fileCache.data
  }

  try {
    const data = await fetchFromApi()
    const entry: CacheEntry = { data, timestamp: Date.now() }
    memoryCache = entry
    await writeFileCache(entry)
    return data
  } catch (error) {
    if (fileCache) {
      memoryCache = fileCache
      return fileCache.data
    }
    if (memoryCache) {
      return memoryCache.data
    }
    throw error
  }
}

export function clearCache(): void {
  memoryCache = null
}
