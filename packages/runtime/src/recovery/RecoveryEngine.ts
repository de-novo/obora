import type {
  AlternativeRecoveryStrategy,
  CellFailure,
  EscalateRecoveryStrategy,
  RecoveryContext,
  RecoveryEngine as RecoveryEngineContract,
  RecoveryResult,
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
    context: Required<RecoveryContext>
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
    context: Required<RecoveryContext>
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
    context: Required<RecoveryContext>
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
    context: Required<RecoveryContext>
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
  private readonly context: Required<RecoveryContext>;
  private readonly plugins = new Map<RecoveryStrategy["type"], RecoveryStrategyPlugin>();

  constructor(context: RecoveryContext = {}) {
    this.context = {
      retryExecutor: context.retryExecutor,
      snapshotStore: context.snapshotStore,
      escalationNotifier: context.escalationNotifier,
      alternativeExecutor: context.alternativeExecutor,
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

  async handle(failure: CellFailure, strategy: RecoveryStrategy): Promise<RecoveryResult> {
    const plugin = this.plugins.get(strategy.type);
    if (!plugin) {
      return fail(strategy.type, new Error(`unsupported recovery strategy: ${strategy.type}`));
    }

    return plugin.execute(failure, strategy, this.context);
  }
}

// Legacy export for compatibility during M1 migration.
export { Supervisor as LegacyRecoveryEngine } from "../_legacy/actor/supervision/Supervisor.js";
export { RecoveryEngine as DefaultRecoveryEngine };
