import { ClaudeProvider, DebateEngine, OpenAIProvider } from '../packages/core/src'
import type { BenchmarkCase, BenchmarkResult, BenchmarkSummary } from './types'

export interface BenchmarkRunnerConfig {
  modes: Array<'single' | 'parallel' | 'strong'>
  providers: Array<'claude' | 'openai' | 'gemini'>
  outputDir: string
}

export class BenchmarkRunner {
  private config: BenchmarkRunnerConfig
  private results: BenchmarkResult[] = []

  constructor(config: Partial<BenchmarkRunnerConfig> = {}) {
    this.config = {
      modes: config.modes || ['strong'],
      providers: config.providers || ['claude', 'openai'],
      outputDir: config.outputDir || './benchmark/results',
    }
  }

  async runCase(testCase: BenchmarkCase): Promise<BenchmarkResult> {
    const startTime = Date.now()

    const claude = new ClaudeProvider()
    const openai = new OpenAIProvider()

    const engine = new DebateEngine({
      mode: 'strong',
      maxRounds: 10,
      timeout: 300000,
    })

    const result = await engine.run({
      topic: testCase.topic,
      participants: [
        { name: 'claude', provider: claude },
        { name: 'openai', provider: openai },
      ],
      orchestrator: claude,
    })

    const benchmarkResult: BenchmarkResult = {
      caseId: testCase.id,
      mode: 'strong',
      duration: Date.now() - startTime,
      rounds: result.rounds.length,
      consensus: result.consensus,
      positionChanges: result.positionChanges.length,
      contentLength: JSON.stringify(result).length,
      timestamp: Date.now(),
    }

    this.results.push(benchmarkResult)
    return benchmarkResult
  }

  async runAll(cases: BenchmarkCase[]): Promise<BenchmarkSummary> {
    console.log(`Running ${cases.length} benchmark cases...`)

    for (const testCase of cases) {
      console.log(`\n[${testCase.id}] ${testCase.name}`)
      try {
        const result = await this.runCase(testCase)
        console.log(`  ✅ Completed in ${(result.duration / 1000).toFixed(1)}s`)
      } catch (error) {
        console.log(`  ❌ Failed: ${error}`)
      }
    }

    return this.getSummary()
  }

  getSummary(): BenchmarkSummary {
    const completed = this.results.length
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0)
    const totalContentLength = this.results.reduce((sum, r) => sum + r.contentLength, 0)

    const byMode: BenchmarkSummary['byMode'] = {}
    for (const result of this.results) {
      if (!byMode[result.mode]) {
        byMode[result.mode] = { count: 0, avgDuration: 0, avgContentLength: 0 }
      }
      const modeStats = byMode[result.mode]!
      modeStats.count++
      modeStats.avgDuration += result.duration
      modeStats.avgContentLength += result.contentLength
    }

    for (const mode of Object.keys(byMode)) {
      const modeStats = byMode[mode]!
      modeStats.avgDuration /= modeStats.count
      modeStats.avgContentLength /= modeStats.count
    }

    return {
      totalCases: completed,
      completedCases: completed,
      failedCases: 0,
      averageDuration: completed > 0 ? totalDuration / completed : 0,
      averageContentLength: completed > 0 ? totalContentLength / completed : 0,
      byMode,
    }
  }

  async saveResults(filename?: string): Promise<string> {
    const outputPath = `${this.config.outputDir}/${filename || `benchmark-${Date.now()}.json`}`
    await Bun.write(
      outputPath,
      JSON.stringify(
        {
          summary: this.getSummary(),
          results: this.results,
        },
        null,
        2,
      ),
    )
    return outputPath
  }
}
