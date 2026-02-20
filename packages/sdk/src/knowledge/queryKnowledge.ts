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

type KnowledgeProvider = () => Promise<KnowledgeResult[]>;

let knowledgeProvider: KnowledgeProvider = async () => [];

export function configureKnowledgeProvider(provider: KnowledgeProvider): void {
  knowledgeProvider = provider;
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
