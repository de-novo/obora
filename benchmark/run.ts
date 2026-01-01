#!/usr/bin/env bun

/**
 * Benchmark Runner
 *
 * Usage:
 *   bun benchmark/run.ts
 */

import { CASES } from './cases'
import { BenchmarkRunner } from './runner'

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║              🔬 Obora Benchmark Runner                        ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  const runner = new BenchmarkRunner({
    modes: ['strong'],
    providers: ['claude', 'openai'],
    outputDir: './benchmark/results',
  })

  const summary = await runner.runAll(CASES)

  console.log('\n\n')
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║                    📊 Benchmark Summary                       ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`Total cases: ${summary.totalCases}`)
  console.log(`Completed: ${summary.completedCases}`)
  console.log(`Failed: ${summary.failedCases}`)
  console.log(`Average duration: ${(summary.averageDuration / 1000).toFixed(1)}s`)
  console.log(`Average content length: ${summary.averageContentLength.toLocaleString()} chars`)

  const outputPath = await runner.saveResults()
  console.log(`\n💾 Results saved: ${outputPath}`)
}

main().catch(console.error)
