/**
 * Circuit Breaker for LLM calls.
 *
 * Prevents cascading failures when an LLM provider is down or degraded.
 * States: CLOSED (normal) → OPEN (tripped) → HALF_OPEN (probe)
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  /** Failure count threshold to trip the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in ms before attempting recovery (half-open). Default: 30000 */
  resetTimeoutMs?: number;
  /** Number of successful calls in half-open to close circuit. Default: 2 */
  successThreshold?: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;
    this.successThreshold = config.successThreshold ?? 2;
  }

  getState(): CircuitState {
    if (this.state === "open") {
      // Check if enough time has passed to try half-open
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "half_open";
        this.successCount = 0;
      }
    }
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === "open") {
      throw new CircuitOpenError(
        `Circuit breaker is open. Last failure: ${new Date(this.lastFailureTime).toISOString()}. Reset after ${this.resetTimeoutMs}ms.`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "half_open") {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = "closed";
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "half_open") {
      this.state = "open";
      this.successCount = 0;
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = "open";
    }
  }

  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  getStats(): { state: CircuitState; failureCount: number; successCount: number; lastFailureTime: number } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

export class CircuitOpenError extends Error {
  readonly code = "CIRCUIT_OPEN";
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}
