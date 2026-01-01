export interface BenchmarkCase {
  id: string
  name: string
  category: 'technical' | 'decision' | 'security' | 'architecture'
  topic: string
  context?: string
  expectedOutcome?: string
}

export type BenchmarkMode = 'single' | 'parallel' | 'weak' | 'strong'

export interface BenchmarkResult {
  caseId: string
  caseName: string
  mode: BenchmarkMode
  duration: number
  rounds: number
  consensus?: string
  positionChanges: number
  contentLength: number
  timestamp: number
  fullResult?: unknown
}

export interface BenchmarkSummary {
  runId: string
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
