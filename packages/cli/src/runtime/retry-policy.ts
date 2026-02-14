export interface RetryPolicy {
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier?: number;
  jitterRatio?: number;
}

const DEFAULT_BACKOFF_MULTIPLIER = 2;
const DEFAULT_JITTER_RATIO = 0.2;

export function calculateDelay(attempt: number, policy: RetryPolicy): number {
  const multiplier = policy.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER;
  const jitterRatio = policy.jitterRatio ?? DEFAULT_JITTER_RATIO;

  const exponential = policy.baseDelayMs * Math.pow(multiplier, Math.max(0, attempt));
  const capped = Math.min(exponential, policy.maxDelayMs);
  const jitter = capped * jitterRatio * (Math.random() * 2 - 1);

  return Math.max(0, Math.min(policy.maxDelayMs, Math.round(capped + jitter)));
}

export async function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
