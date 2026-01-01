import { ClaudeProvider, DebateEngine, OpenAIProvider } from '../packages/core/src'
import type { BenchmarkCase, BenchmarkResult, BenchmarkSummary } from './types'

export interface BenchmarkRunnerConfig {
  modes: Array<'single' | 'parallel' | 'strong'>
  providers: Array<'claude' | 'openai' | 'gemini'>
  outputDir: string
  concurrency: number // 병렬 실행 수
}

export class BenchmarkRunner {
  private config: BenchmarkRunnerConfig
  private results: BenchmarkResult[] = []
  private runId: string

  constructor(config: Partial<BenchmarkRunnerConfig> = {}) {
    this.config = {
      modes: config.modes || ['strong'],
      providers: config.providers || ['claude', 'openai'],
      outputDir: config.outputDir || './benchmark/results',
      concurrency: config.concurrency || 3, // 기본 3개 병렬
    }
    this.runId = Date.now().toString()
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-') // 특수문자를 하이픈으로
      .replace(/^-+|-+$/g, '') // 앞뒤 하이픈 제거
  }

  private async saveResult(result: BenchmarkResult): Promise<void> {
    const filename = this.sanitizeFilename(result.caseName)
    const outputPath = `${this.config.outputDir}/${this.runId}/${filename}.json`
    await Bun.write(outputPath, JSON.stringify(result, null, 2))
  }

  private async saveMeta(): Promise<void> {
    const metaPath = `${this.config.outputDir}/${this.runId}/_meta.json`
    await Bun.write(
      metaPath,
      JSON.stringify(
        {
          runId: this.runId,
          startedAt: this.runId,
          completedCases: this.results.length,
          summary: this.getSummary(),
        },
        null,
        2,
      ),
    )
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
      caseName: testCase.name,
      mode: 'strong',
      duration: Date.now() - startTime,
      rounds: result.rounds.length,
      consensus: result.consensus,
      positionChanges: result.positionChanges.length,
      contentLength: JSON.stringify(result).length,
      timestamp: Date.now(),
      fullResult: result,
    }

    // 즉시 저장
    await this.saveResult(benchmarkResult)
    this.results.push(benchmarkResult)
    await this.saveMeta()

    return benchmarkResult
  }

  async runAll(cases: BenchmarkCase[]): Promise<BenchmarkSummary> {
    console.log(`Running ${cases.length} benchmark cases (concurrency: ${this.config.concurrency})...`)
    console.log(`Results will be saved to: ${this.config.outputDir}/${this.runId}/\n`)

    // 결과 폴더 생성
    await Bun.write(`${this.config.outputDir}/${this.runId}/.gitkeep`, '')

    // 병렬 실행 with concurrency limit
    const runWithLimit = async () => {
      const running: Promise<void>[] = []
      const queue = [...cases]

      while (queue.length > 0 || running.length > 0) {
        // 슬롯이 있고 큐에 케이스가 있으면 시작
        while (running.length < this.config.concurrency && queue.length > 0) {
          const testCase = queue.shift()!
          const promise = (async () => {
            console.log(`[${testCase.id}] ${testCase.name} - Starting...`)
            try {
              const result = await this.runCase(testCase)
              console.log(`[${testCase.id}] ✅ Completed in ${(result.duration / 1000).toFixed(1)}s`)
            } catch (error) {
              console.log(`[${testCase.id}] ❌ Failed: ${error}`)
            }
          })()

          running.push(promise)
          promise.finally(() => {
            const idx = running.indexOf(promise)
            if (idx > -1) running.splice(idx, 1)
          })
        }

        // 하나라도 완료될 때까지 대기
        if (running.length > 0) {
          await Promise.race(running)
        }
      }
    }

    await runWithLimit()

    // 최종 메타 저장
    await this.saveMeta()

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
      runId: this.runId,
      totalCases: completed,
      completedCases: completed,
      failedCases: 0,
      averageDuration: completed > 0 ? totalDuration / completed : 0,
      averageContentLength: completed > 0 ? totalContentLength / completed : 0,
      byMode,
    }
  }

  getRunId(): string {
    return this.runId
  }
}
