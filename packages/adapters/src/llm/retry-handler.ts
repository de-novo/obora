import { RetryExhaustedError } from "../errors";
import { LLMAdapter } from "./adapter";

export { RetryExhaustedError } from "../errors";

export class RetryHandler {
  constructor(
    private readonly maxRetries: number = 3,
    private readonly baseDelay: number = 1000,
    private readonly maxDelay: number = 10000
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    isRetryable: (error: Error) => boolean = this.defaultIsRetryable
  ): Promise<T> {
    const runAttempt = async (attempt: number, lastError?: Error): Promise<T> => {
      if (attempt > this.maxRetries) {
        throw lastError!;
      }

      try {
        return await operation();
      } catch (error) {
        const currentError = error as Error;

        if (!isRetryable(currentError)) {
          throw currentError;
        }

        if (attempt === this.maxRetries) {
          throw new RetryExhaustedError(
            `Max retries (${this.maxRetries}) exceeded`,
            currentError,
            attempt + 1
          );
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
        return runAttempt(attempt + 1, currentError);
      }
    };

    return runAttempt(0);
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private defaultIsRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      ((error as { statusCode?: number }).statusCode ?? 0) >= 500
    );
  }
}

export function withRetry<T extends LLMAdapter>(
  adapter: T,
  config?: { maxRetries?: number; baseDelay?: number; maxDelay?: number }
): T {
  const retryHandler = new RetryHandler(config?.maxRetries, config?.baseDelay, config?.maxDelay);

  return new Proxy(adapter, {
    get(target, prop) {
      const value = target[prop as keyof T];

      if (
        typeof value === "function" &&
        (prop === "chatCompletion" || prop === "streamChatCompletion")
      ) {
        return async (...args: unknown[]) => {
          return retryHandler.execute(() => value.apply(target, args));
        };
      }

      return value;
    },
  }) as T;
}
