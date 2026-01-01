import type { BenchmarkCase } from '../types'
import { ARCHITECTURE_CASES } from './architecture'
import { DECISION_CASES } from './decision'
import { SECURITY_CASES } from './security'
import { TECHNICAL_CASES } from './technical'

// Re-export individual category cases
export { ARCHITECTURE_CASES } from './architecture'
export { DECISION_CASES } from './decision'
export { SECURITY_CASES } from './security'
export { TECHNICAL_CASES } from './technical'

// Combined cases for full benchmark
export const CASES: BenchmarkCase[] = [...ARCHITECTURE_CASES, ...TECHNICAL_CASES, ...SECURITY_CASES, ...DECISION_CASES]

// Category-specific exports for targeted testing
export const CASES_BY_CATEGORY = {
  architecture: ARCHITECTURE_CASES,
  technical: TECHNICAL_CASES,
  security: SECURITY_CASES,
  decision: DECISION_CASES,
} as const

// Summary
export const CASE_SUMMARY = {
  total: CASES.length,
  architecture: ARCHITECTURE_CASES.length,
  technical: TECHNICAL_CASES.length,
  security: SECURITY_CASES.length,
  decision: DECISION_CASES.length,
}
