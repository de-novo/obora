import type {
  AlternativeRecoveryStrategy,
  CellFailure,
  EscalateRecoveryStrategy,
  RecoveryContext,
  RecoveryEngine as RecoveryEngineContract,
  RecoveryExecutionContext,
  RecoveryResult,
  RecoveryHandleOptions,
  RecoveryStrategy,
  RecoveryStrategyPlugin,
  RollbackRecoveryStrategy,
  RetryRecoveryStrategy,
} from "./types.js";
import { calculateRetryDelay } from "./RetryStrategy.js";

const defaultWait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const fail = (strategy: RecoveryStrategy["type"], error: Error): RecoveryResult => ({
  status: "failed",
  strategy,
  error,
});

class RetryStrategyPluginImpl implements RecoveryStrategyPlugin {
  readonly type = "retry" as const;

  async execute(
    failure: CellFailure,
    strategy: RetryRecoveryStrategy,
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    const { retryExecutor, wait } = context;

    if (!retryExecutor) {
      return fail(this.type, new Error("retryExecutor is required for retry strategy"));
    }

    if (failure.attempt >= strategy.maxAttempts) {
      return {
        status: "failed",
        strategy: this.type,
        attempts: failure.attempt,
        error: new Error(`max retry attempts reached: ${failure.attempt}/${strategy.maxAttempts}`),
      };
    }

    const nextAttempt = failure.attempt + 1;
    const delay = calculateRetryDelay(strategy, nextAttempt);
    await wait(delay);

    try {
      await retryExecutor.executeRetry({ ...failure, attempt: nextAttempt });
      return {
        status: "recovered",
        strategy: this.type,
        attempts: nextAttempt,
        details: { delayMs: delay, mode: strategy.mode },
      };
    } catch (error) {
      return {
        status: "failed",
        strategy: this.type,
        attempts: nextAttempt,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

class RollbackStrategyPluginImpl implements RecoveryStrategyPlugin {
  readonly type = "rollback" as const;

  async execute(
    _failure: CellFailure,
    strategy: RollbackRecoveryStrategy,
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    if (!context.snapshotStore) {
      return fail(this.type, new Error("snapshotStore is required for rollback strategy"));
    }

    try {
      await context.snapshotStore.restore(strategy.snapshotId);
      return {
        status: "recovered",
        strategy: this.type,
        details: { snapshotId: strategy.snapshotId },
      };
    } catch (error) {
      return fail(this.type, error instanceof Error ? error : new Error(String(error)));
    }
  }
}

class EscalateStrategyPluginImpl implements RecoveryStrategyPlugin {
  readonly type = "escalate" as const;

  async execute(
    failure: CellFailure,
    strategy: EscalateRecoveryStrategy,
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    if (!context.escalationNotifier) {
      return fail(this.type, new Error("escalationNotifier is required for escalate strategy"));
    }

    try {
      await context.escalationNotifier.notify({
        failure,
        severity: strategy.severity,
        channel: strategy.channel,
        summary: strategy.summary,
      });

      return {
        status: "escalated",
        strategy: this.type,
        details: { channel: strategy.channel, severity: strategy.severity },
      };
    } catch (error) {
      return fail(this.type, error instanceof Error ? error : new Error(String(error)));
    }
  }
}

class AlternativeStrategyPluginImpl implements RecoveryStrategyPlugin {
  readonly type = "alternative" as const;

  async execute(
    failure: CellFailure,
    strategy: AlternativeRecoveryStrategy,
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    if (!context.alternativeExecutor) {
      return fail(this.type, new Error("alternativeExecutor is required for alternative strategy"));
    }

    try {
      const result = await context.alternativeExecutor.executeAlternative({
        failure,
        stepName: strategy.stepName,
        payload: strategy.payload,
      });

      return {
        status: "recovered",
        strategy: this.type,
        details: { stepName: strategy.stepName, result },
      };
    } catch (error) {
      return fail(this.type, error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class RecoveryEngine implements RecoveryEngineContract {
  private readonly context: RecoveryContext & { wait: NonNullable<RecoveryContext["wait"]> };
  private readonly plugins = new Map<RecoveryStrategy["type"], RecoveryStrategyPlugin>();

  constructor(context: RecoveryContext = {}) {
    this.context = {
      retryExecutor: context.retryExecutor,
      snapshotStore: context.snapshotStore,
      escalationNotifier: context.escalationNotifier,
      alternativeExecutor: context.alternativeExecutor,
      consensusGate: context.consensusGate,
      auditTrail: context.auditTrail,
      wait: context.wait ?? defaultWait,
    };

    this.register(new RetryStrategyPluginImpl());
    this.register(new RollbackStrategyPluginImpl());
    this.register(new EscalateStrategyPluginImpl());
    this.register(new AlternativeStrategyPluginImpl());
  }

  register(plugin: RecoveryStrategyPlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  async handle(
    failure: CellFailure,
    strategy: RecoveryStrategy,
    options: RecoveryHandleOptions = {}
  ): Promise<RecoveryResult> {
    await this.recordAudit("recovery_start", failure, {
      strategy: strategy.type,
      options,
    });

    if (options.consensusSessionId && this.context.consensusGate) {
      const consensus = this.context.consensusGate.evaluate(options.consensusSessionId);
      if (consensus.status !== "pass") {
        const blockedResult: RecoveryResult = {
          status: "failed",
          strategy: strategy.type,
          error: new Error(
            `recovery blocked by consensus status: ${consensus.status} (session: ${options.consensusSessionId})`
          ),
          details: {
            consensusSessionId: options.consensusSessionId,
            consensusStatus: consensus.status,
          },
        };

        await this.recordAudit("recovery_end", failure, {
          strategy: strategy.type,
          result: blockedResult,
        });

        return blockedResult;
      }
    }

    const plugin = this.plugins.get(strategy.type);
    const result = !plugin
      ? fail(strategy.type, new Error(`unsupported recovery strategy: ${strategy.type}`))
      : await plugin.execute(failure, strategy, this.context);

    await this.recordAudit("recovery_end", failure, {
      strategy: strategy.type,
      result,
    });

    return result;
  }

  private async recordAudit(
    type: "recovery_start" | "recovery_end",
    failure: CellFailure,
    data: unknown
  ): Promise<void> {
    if (!this.context.auditTrail) {
      return;
    }

    await this.context.auditTrail.record({
      id: crypto.randomUUID(),
      executionId: failure.executionId,
      cellId: failure.cellId,
      timestamp: new Date(),
      type,
      data,
    });
  }
}

export { RecoveryEngine as DefaultRecoveryEngine };
