import { ClaudeProvider, DebateEngine, OpenAIProvider } from '../packages/core/src'
import type { BenchmarkCase, BenchmarkMode, BenchmarkResult, BenchmarkSummary } from './types'

export interface BenchmarkRunnerConfig {
  modes: BenchmarkMode[]
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
      modes: config.modes || ['single', 'parallel', 'weak', 'strong'], // 기본: 모든 모드
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
    const outputPath = `${this.config.outputDir}/${this.runId}/${result.mode}/${filename}.json`
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

  async runCase(testCase: BenchmarkCase, mode: BenchmarkMode): Promise<BenchmarkResult> {
    const startTime = Date.now()

    const claude = new ClaudeProvider()
    const openai = new OpenAIProvider()

    let result: {
      rounds: Array<{ phase: string; speaker: string; content: string; timestamp: number }>
      consensus?: string
      positionChanges: unknown[]
    }

    if (mode === 'single') {
      // Single: Claude만 응답
      const response = await claude.run(testCase.topic)
      result = {
        rounds: [{ phase: 'single', speaker: 'claude', content: response.content, timestamp: Date.now() }],
        consensus: response.content,
        positionChanges: [],
      }
    } else if (mode === 'parallel') {
      // Parallel: Claude와 OpenAI가 동시에 응답 (토론 없음)
      const [claudeResponse, openaiResponse] = await Promise.all([
        claude.run(testCase.topic),
        openai.run(testCase.topic),
      ])
      result = {
        rounds: [
          { phase: 'parallel', speaker: 'claude', content: claudeResponse.content, timestamp: Date.now() },
          { phase: 'parallel', speaker: 'openai', content: openaiResponse.content, timestamp: Date.now() },
        ],
        positionChanges: [],
      }
    } else {
      // weak 또는 strong: DebateEngine 사용
      const engine = new DebateEngine({
        mode: mode === 'weak' ? 'weak' : 'strong',
        maxRounds: 10,
        timeout: 300000,
      })

      result = await engine.run({
        topic: testCase.topic,
        participants: [
          { name: 'claude', provider: claude },
          { name: 'openai', provider: openai },
        ],
        orchestrator: claude,
      })
    }

    const benchmarkResult: BenchmarkResult = {
      caseId: testCase.id,
      caseName: testCase.name,
      mode,
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
    const totalRuns = cases.length * this.config.modes.length
    console.log(`Running ${cases.length} cases × ${this.config.modes.length} modes = ${totalRuns} total runs`)
    console.log(`Modes: ${this.config.modes.join(', ')}`)
    console.log(`Concurrency: ${this.config.concurrency}`)
    console.log(`Results: ${this.config.outputDir}/${this.runId}/\n`)

    // 모드별 폴더 생성
    for (const mode of this.config.modes) {
      await Bun.write(`${this.config.outputDir}/${this.runId}/${mode}/.gitkeep`, '')
    }

    // 케이스 × 모드 조합 생성
    const queue: Array<{ testCase: BenchmarkCase; mode: BenchmarkMode }> = []
    for (const testCase of cases) {
      for (const mode of this.config.modes) {
        queue.push({ testCase, mode })
      }
    }

    // 병렬 실행 with concurrency limit
    const runWithLimit = async () => {
      const running: Promise<void>[] = []

      while (queue.length > 0 || running.length > 0) {
        // 슬롯이 있고 큐에 케이스가 있으면 시작
        while (running.length < this.config.concurrency && queue.length > 0) {
          const { testCase, mode } = queue.shift()!
          const promise = (async () => {
            console.log(`[${testCase.id}][${mode}] ${testCase.name} - Starting...`)
            try {
              const result = await this.runCase(testCase, mode)
              console.log(`[${testCase.id}][${mode}] ✅ Completed in ${(result.duration / 1000).toFixed(1)}s`)
            } catch (error) {
              console.log(`[${testCase.id}][${mode}] ❌ Failed: ${error}`)
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
