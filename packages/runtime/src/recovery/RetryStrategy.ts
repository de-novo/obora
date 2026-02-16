import type { RetryRecoveryStrategy } from "./types.js";

const DEFAULT_MULTIPLIER = 2;

export function calculateRetryDelay(strategy: RetryRecoveryStrategy, attempt: number): number {
  const safeAttempt = Math.max(1, attempt);

  if (strategy.mode === "linear") {
    return Math.min(strategy.maxDelayMs, strategy.initialDelayMs * safeAttempt);
  }

  const multiplier = strategy.multiplier ?? DEFAULT_MULTIPLIER;
  const exponential = strategy.initialDelayMs * Math.pow(multiplier, safeAttempt - 1);
  return Math.min(strategy.maxDelayMs, exponential);
}
