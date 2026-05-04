export interface KnowledgeResult {
  id: string;
  title: string;
  body: string;
  tags: string[];
  source: string;
  projectId?: string;
  confidence: number;
  createdAt: string;
  updatedAt?: string;
}

export interface QueryKnowledgeParams {
  tags?: string[];
  textQuery?: string;
  minConfidence?: number;
  limit?: number;
  projectId?: string;
}

interface CacheEntry {
  expiresAt: number;
  value: KnowledgeResult[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(params: QueryKnowledgeParams): string {
  return JSON.stringify({
    t: params.tags?.slice().sort(),
    q: params.textQuery ?? "",
    c: params.minConfidence ?? null,
    l: params.limit ?? null,
    p: params.projectId ?? null,
  });
}

export function getCachedKnowledge(params: QueryKnowledgeParams): KnowledgeResult[] | null {
  const key = cacheKey(params);
  const now = Date.now();
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < now) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCachedKnowledge(params: QueryKnowledgeParams, value: KnowledgeResult[], ttlMs = 30_000): void {
  const key = cacheKey(params);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearKnowledgeCache(): void {
  cache.clear();
}
