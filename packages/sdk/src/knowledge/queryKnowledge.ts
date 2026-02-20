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

export type KnowledgeProvider = () => Promise<KnowledgeResult[]>;

export interface BlackboardKnowledgeSnapshot {
  knowledge?: {
    facts?: Array<{
      id: string;
      content: string;
      tags?: string[];
      source?: string;
      confidence?: number;
      createdAt?: string | Date;
      updatedAt?: string | Date;
      category?: string;
    }>;
    inferences?: Array<{
      id: string;
      conclusion: string;
      tags?: string[];
      source?: string;
      confidence?: number;
      createdAt?: string | Date;
      updatedAt?: string | Date;
      method?: string;
    }>;
    patterns?: Array<{
      id: string;
      name: string;
      description?: string;
      tags?: string[];
      discoveredBy?: string;
      confidence?: number;
      createdAt?: string | Date;
      updatedAt?: string | Date;
    }>;
  };
}

let knowledgeProvider: KnowledgeProvider = async () => [];

export function configureKnowledgeProvider(provider: KnowledgeProvider): void {
  knowledgeProvider = provider;
}

function toIso(value: string | Date | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}

export function mapBlackboardToKnowledgeResults(snapshot: BlackboardKnowledgeSnapshot): KnowledgeResult[] {
  const facts = (snapshot.knowledge?.facts ?? []).map<KnowledgeResult>((f) => ({
    id: f.id,
    title: f.category ? `${f.category} fact` : "fact",
    body: f.content,
    tags: f.tags ?? [],
    source: f.source ?? "unknown",
    confidence: f.confidence ?? 0,
    createdAt: toIso(f.createdAt),
    updatedAt: toIso(f.updatedAt),
  }));

  const inferences = (snapshot.knowledge?.inferences ?? []).map<KnowledgeResult>((i) => ({
    id: i.id,
    title: i.method ? `${i.method} inference` : "inference",
    body: i.conclusion,
    tags: i.tags ?? [],
    source: i.source ?? "unknown",
    confidence: i.confidence ?? 0,
    createdAt: toIso(i.createdAt),
    updatedAt: toIso(i.updatedAt),
  }));

  const patterns = (snapshot.knowledge?.patterns ?? []).map<KnowledgeResult>((p) => ({
    id: p.id,
    title: p.name,
    body: p.description ?? "",
    tags: p.tags ?? [],
    source: p.discoveredBy ?? "unknown",
    confidence: p.confidence ?? 0,
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
  }));

  return [...facts, ...inferences, ...patterns];
}

export function configureKnowledgeProviderFromBlackboard(snapshot: BlackboardKnowledgeSnapshot): void {
  const entries = mapBlackboardToKnowledgeResults(snapshot);
  knowledgeProvider = async () => entries;
}

export async function queryKnowledge(params: QueryKnowledgeParams): Promise<KnowledgeResult[]> {
  const entries = await knowledgeProvider();
  const normalizedText = params.textQuery?.toLowerCase().trim();

  const filtered = entries.filter((entry) => {
    if (params.projectId && entry.projectId !== params.projectId) return false;
    if (params.minConfidence !== undefined && entry.confidence < params.minConfidence) return false;

    if (params.tags && params.tags.length > 0) {
      const hasAllTags = params.tags.every((tag) => entry.tags.includes(tag));
      if (!hasAllTags) return false;
    }

    if (normalizedText) {
      const haystack = `${entry.title}\n${entry.body}`.toLowerCase();
      if (!haystack.includes(normalizedText)) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const createdDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (createdDiff !== 0) return createdDiff;
    return b.confidence - a.confidence;
  });

  const limit = params.limit ?? 20;
  return filtered.slice(0, Math.max(0, limit));
}
