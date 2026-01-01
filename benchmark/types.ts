export interface BenchmarkCase {
  id: string
  name: string
  category: 'technical' | 'decision' | 'security' | 'architecture'
  topic: string
  context?: string
  expectedOutcome?: string
}

export interface BenchmarkResult {
  caseId: string
  mode: 'single' | 'parallel' | 'strong'
  duration: number
  rounds: number
  consensus?: string
  positionChanges: number
  contentLength: number
  timestamp: number
}

export interface BenchmarkSummary {
  totalCases: number
  completedCases: number
  failedCases: number
  averageDuration: number
  averageContentLength: number
  byMode: Record<
    string,
    {
      count: number
      avgDuration: number
      avgContentLength: number
    }
  >
}
