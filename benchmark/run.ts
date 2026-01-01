#!/usr/bin/env bun

/**
 * Benchmark Runner
 *
 * Usage:
 *   bun benchmark/run.ts              # Run all cases
 *   bun benchmark/run.ts arch         # Run architecture cases only
 *   bun benchmark/run.ts tech         # Run technical cases only
 *   bun benchmark/run.ts sec          # Run security cases only
 *   bun benchmark/run.ts dec          # Run decision cases only
 *   bun benchmark/run.ts arch-006     # Run specific case by ID
 */

import { ARCHITECTURE_CASES, CASES, DECISION_CASES, SECURITY_CASES, TECHNICAL_CASES } from './cases'
import { BenchmarkRunner } from './runner'

const CATEGORY_MAP = {
  arch: { name: 'Architecture', cases: ARCHITECTURE_CASES },
  tech: { name: 'Technical', cases: TECHNICAL_CASES },
  sec: { name: 'Security', cases: SECURITY_CASES },
  dec: { name: 'Decision', cases: DECISION_CASES },
  all: { name: 'All', cases: CASES },
} as const

async function main() {
  const arg = process.argv[2] || 'all'

  // Check if it's a specific case ID (e.g., arch-006)
  if (arg.includes('-') && !['arch', 'tech', 'sec', 'dec', 'all'].includes(arg)) {
    const specificCase = CASES.find((c) => c.id === arg)
    if (!specificCase) {
      console.error(`❌ Case not found: ${arg}`)
      console.error(`Available cases: ${CASES.map((c) => c.id).join(', ')}`)
      process.exit(1)
    }

    console.log('╔══════════════════════════════════════════════════════════════╗')
    console.log(`║              🔬 Obora Benchmark: Single Case                  ║`)
    console.log('╚══════════════════════════════════════════════════════════════╝')
    console.log(`\n📋 Running case: ${specificCase.id} - ${specificCase.name}\n`)

    const runner = new BenchmarkRunner({
      providers: ['claude', 'openai'],
      outputDir: './benchmark/results',
      concurrency: 1, // 단일 케이스는 순차 실행
    })

    const summary = await runner.runAll([specificCase])

    console.log('\n\n')
    console.log('╔══════════════════════════════════════════════════════════════╗')
    console.log('║                    📊 Benchmark Summary                       ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')
    console.log(`Total runs: ${summary.totalCases}`)
    console.log(`Completed: ${summary.completedCases}`)

    if (summary.byMode) {
      console.log('\nBy mode:')
      for (const [mode, stats] of Object.entries(summary.byMode)) {
        console.log(`  ${mode}: ${(stats.avgDuration / 1000).toFixed(1)}s`)
      }
    }

    console.log(`\n💾 Results saved to: ./benchmark/results/${runner.getRunId()}/`)
    return
  }

  const category = arg as keyof typeof CATEGORY_MAP
  const selected = CATEGORY_MAP[category] || CATEGORY_MAP.all

  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log(`║              🔬 Obora Benchmark: ${selected.name.padEnd(20)}       ║`)
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\n📋 Running ${selected.cases.length} cases...\n`)

  const runner = new BenchmarkRunner({
    // modes: 기본값 ['single', 'parallel', 'weak', 'strong']
    providers: ['claude', 'openai'],
    outputDir: './benchmark/results',
  })

  const summary = await runner.runAll(selected.cases)

  console.log('\n\n')
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║                    📊 Benchmark Summary                       ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`Total cases: ${summary.totalCases}`)
  console.log(`Completed: ${summary.completedCases}`)
  console.log(`Failed: ${summary.failedCases}`)
  console.log(`Average duration: ${(summary.averageDuration / 1000).toFixed(1)}s`)
  console.log(`Average content length: ${summary.averageContentLength.toLocaleString()} chars`)

  console.log(`\n💾 Results saved to: ./benchmark/results/${runner.getRunId()}/`)
}

main().catch(console.error)
