import { randomUUID } from "node:crypto";

import { CheckpointManager } from "@obora/runtime";
import type { PolicyHashInput } from "@obora/runtime";

import type { PolicyDefinition } from "../policy.js";
import type { EventBus } from "../events/event-bus.js";
import { type DLQStore, createDLQEntry } from "../dlq/index.js";
import { type ExecutionLock } from "../execution/execution-lock.js";
import type { PersistenceManager } from "../persistence/persistence-manager.js";
import type { WorkflowRunner } from "../execution/workflow-runner.js";
import type { TKGService } from "../execution/tkg-service.js";
import { BudgetExceededError } from "../cost-tracker.js";
import { DEFAULTS } from "../defaults.js";
import {
  OboraError,
  OboraErrorCode,
  type OboraRuntimeConfig,
  type RuntimeExecution,
  type RunHandle,
  type RunOptions,
  type RunStatus,
  type AgentFactory,
} from "../runtime-types.js";
import type { WorkflowDef } from "../workflow.js";
import { PersistenceCoordinator } from "./persistence-coordinator.js";

export interface ExecutionControllerOptions {
  config: OboraRuntimeConfig;
  runner: WorkflowRunner;
  tkgService: TKGService;
  eventBus: EventBus;
  persistenceManager: PersistenceManager;
  dlqStore?: DLQStore;
  executionLock?: ExecutionLock;
  executions: Map<string, RuntimeExecution>;
  policy?: PolicyDefinition;
}

/**
 * ExecutionController orchestrates workflow run lifecycle:
 *   - pre-flight validation, lock acquisition
 *   - async execution via WorkflowRunner
 *   - post-failure handling: DLQ, rollback, auto-recovery
 *   - RunHandle creation with cancel/timeout/signal support
 */
export class ExecutionController {
  private readonly persistenceCoordinator: PersistenceCoordinator;

  constructor(private readonly opts: ExecutionControllerOptions) {
    this.persistenceCoordinator = new PersistenceCoordinator({
      persistenceManager: opts.persistenceManager,
      logger: opts.config.logger,
    });
  }

  setPolicy(policy: PolicyDefinition | undefined): void {
    this.opts.policy = policy;
  }

  async start(
    name: string,
    workflow: WorkflowDef,
    options: RunOptions,
    agents: Map<string, AgentFactory>,
    workflows: Map<string, WorkflowDef>,
  ): Promise<RunHandle> {
    const { input, variables, signal } = options;
    const executionId = randomUUID();

    // P0: Acquire execution lock if enabled
    const executionLock = this.opts.executionLock;
    if (executionLock) {
      const acquired = await executionLock.acquire(name, executionId);
      if (!acquired) {
        throw new OboraError(
          `Another execution of workflow "${name}" is already running. Use executionLock.staleLockThresholdMs to configure stale lock detection.`,
          OboraErrorCode.SDK_UNKNOWN_ERROR,
          executionId,
        );
      }
    }

    const execution: RuntimeExecution = {
      id: executionId,
      workflowName: name,
      status: "running",
      input,
      startedAt: new Date(),
      stepOrder: workflow.steps.map((s) => s.name),
      completedSteps: [],
      stepRecords: {},
      outputs: {},
    };

    const runTimeoutMs = this.resolveExecutionTimeoutMs(workflow, variables);
    const runState = {
      status: "queued" as RunStatus,
      settled: false,
      rejectWait: undefined as ((reason?: unknown) => void) | undefined,
      timeout: undefined as ReturnType<typeof setTimeout> | undefined,
      signalAbortListener: undefined as (() => void) | undefined,
    };

    const waitPromise = new Promise<RuntimeExecution>((resolve, reject) => {
      runState.rejectWait = reject;

      queueMicrotask(async () => {
        try {
          if (runState.settled) return;

          runState.status = "running";
          execution.status = "running";

          await this.opts.runner.executeRun(
            executionId,
            name,
            workflow,
            execution,
            options,
            () => runState.settled,
          );

          if (runState.settled) return;

          runState.status = "completed";
          execution.status = "completed";
          execution.endedAt = new Date();
          runState.settled = true;

          this.opts.executions.set(executionId, structuredClone(execution));
          resolve(structuredClone(execution));
        } catch (error) {
          if (runState.settled) return;

          const budgetExceeded = error instanceof BudgetExceededError;
          runState.status = budgetExceeded ? "suspended" : "failed";
          execution.status = budgetExceeded ? "suspended" : "failed";
          execution.error = error instanceof Error ? error.message : String(error);
          execution.endedAt = new Date();
          runState.settled = true;

          const errorCode = budgetExceeded
            ? OboraErrorCode.POLICY_RESOURCE_EXCEEDED
            : error instanceof OboraError
              ? error.code
              : OboraErrorCode.SDK_UNKNOWN_ERROR;

          // Determine persistence config for error save
          const persistenceConfig =
            this.opts.config.config?.persistence ?? this.opts.config.persistence;
          const persistenceEnabled = persistenceConfig?.enabled ?? false;

          const repairLoopSummary = this.opts.runner.getPersistedRepairLoopSummary(executionId);
          const repairAttempts = repairLoopSummary?.repairStarted ?? 0;

          await this.persistenceCoordinator.saveRunOnError(
            executionId,
            name,
            execution,
            variables,
            errorCode,
            persistenceEnabled,
            persistenceConfig,
            repairLoopSummary,
          );
          this.opts.runner.clearPersistedRepairLoopSummary(executionId);

          // P0: Auto-rollback on execution failure (not budget exceeded)
          if (!budgetExceeded) {
            try {
              const workflowDef = workflows.get(name);
              if (!workflowDef) {
                await this.opts.eventBus.emit("warning", executionId, {
                  message: `Auto-rollback failed: workflow not found: ${name}`,
                  code: "TKG_AUTO_ROLLBACK_FAILED",
                });
              } else {
                const rollbackResult = await this.opts.tkgService.rollbackTKGOnExecutionFailure(
                  executionId,
                  workflowDef,
                );
                if (rollbackResult.restored) {
                  await this.opts.eventBus.emit("warning", executionId, {
                    message: `Auto-rollback completed: ${rollbackResult.restoredFactCount} facts restored`,
                    code: "TKG_AUTO_ROLLBACK_SUCCESS",
                  });
                }
              }
            } catch (rollbackErr) {
              await this.opts.eventBus.emit("warning", executionId, {
                message: `Auto-rollback failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
                code: "TKG_AUTO_ROLLBACK_FAILED",
              });
            }
          }

          // P0: DLQ — capture unrecoverable failures
          if (this.opts.dlqStore && !budgetExceeded) {
            try {
              const dlqEntry = createDLQEntry({
                executionId,
                workflowName: name,
                stepName:
                  repairLoopSummary?.lastRepairStep ??
                  repairLoopSummary?.lastValidationStep,
                errorCode,
                errorMessage: execution.error ?? "Unknown error",
                errorStack: error instanceof Error ? error.stack : undefined,
                repairAttempts,
                metadata: repairLoopSummary
                  ? { repairLoop: repairLoopSummary }
                  : undefined,
              });
              await this.opts.dlqStore.append(dlqEntry);
              await this.opts.eventBus.emit("warning", executionId, {
                message: `Failure captured in DLQ: ${dlqEntry.id}`,
                code: "DLQ_ENTRY_CREATED",
              });
            } catch (dlqErr) {
              this.opts.config.logger?.warn?.("[DLQ] Failed to append entry:", dlqErr);
            }
          }

          // P0: Auto-recovery from checkpoint
          const autoRecovery = this.opts.config.autoRecovery;
          if (autoRecovery?.enabled && !budgetExceeded) {
            const maxRetries = autoRecovery.maxRetries ?? 1;
            const delayMs = autoRecovery.delayMs ?? DEFAULTS.AUTO_RECOVERY_DELAY_MS;
            const driftPolicy = autoRecovery.driftPolicy ?? "warn";

            const recovered = await Array.from({ length: maxRetries }, (_, attempt) => attempt).reduce<Promise<boolean>>(
              async (previous, attempt) => {
                if (await previous) return true;
              try {
                if (delayMs > 0) {
                  await new Promise((r) => setTimeout(r, delayMs));
                }
                await this.opts.eventBus.emit("warning", executionId, {
                  message: `Auto-recovery attempt ${attempt + 1}/${maxRetries} from checkpoint`,
                  code: "AUTO_RECOVERY_ATTEMPT",
                });
                const resumeResult = await this.resume(executionId, { driftPolicy }, workflows);
                if (resumeResult.execution.status === "completed") {
                  runState.status = "completed";
                  execution.status = "completed";
                  execution.endedAt = new Date();
                  this.opts.executions.set(executionId, structuredClone(execution));
                  resolve(structuredClone(execution));
                    return true;
                }
              } catch (recoveryErr) {
                await this.opts.eventBus.emit("warning", executionId, {
                  message: `Auto-recovery attempt ${attempt + 1} failed: ${recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr)}`,
                  code: "AUTO_RECOVERY_FAILED",
                });
              }
                return false;
              },
              Promise.resolve(false)
            );
            if (recovered) {
              return;
            }
          }

          await this.opts.eventBus.emit("error", executionId, {
            message: execution.error,
            code: errorCode,
          });
          await this.opts.eventBus.emit("execution_end", executionId, {
            workflowName: name,
            status: budgetExceeded ? "suspended" : "failed",
          });

          reject(
            budgetExceeded
              ? new OboraError(
                  execution.error,
                  OboraErrorCode.POLICY_RESOURCE_EXCEEDED,
                  executionId,
                )
              : error,
          );
        } finally {
          if (runState.timeout) {
            clearTimeout(runState.timeout);
            runState.timeout = undefined;
          }
          runState.signalAbortListener?.();
          runState.signalAbortListener = undefined;

          if (this.opts.executionLock) {
            try {
              await this.opts.executionLock.release(name);
            } catch {
              // Best-effort release
            }
          }
        }
      });
    });

    const handle: RunHandle = {
      executionId,
      get status() {
        return runState.status;
      },
      wait: () => waitPromise,
      cancel: async (reason?: string) => {
        if (
          runState.settled ||
          runState.status === "completed" ||
          runState.status === "failed" ||
          runState.status === "aborted"
        ) {
          return;
        }

        if (runState.timeout) {
          clearTimeout(runState.timeout);
          runState.timeout = undefined;
        }
        runState.signalAbortListener?.();
        runState.signalAbortListener = undefined;

        runState.status = "aborted";
        execution.status = "aborted";
        execution.error = reason ?? "Execution cancelled";
        execution.endedAt = new Date();
        runState.settled = true;

        const abortError = OboraError.executionCancelled(executionId, reason);

        await this.opts.eventBus.emit("error", executionId, {
          message: abortError.message,
          code: abortError.code,
        });
        const persistenceConfig =
          this.opts.config.config?.persistence ?? this.opts.config.persistence;
        const persistenceEnabled = persistenceConfig?.enabled ?? false;

        const repairLoopSummary = this.opts.runner.getPersistedRepairLoopSummary(executionId);
        await this.persistenceCoordinator.saveRunOnError(
          executionId,
          name,
          execution,
          variables,
          OboraErrorCode.SDK_EXECUTION_CANCELLED,
          persistenceEnabled,
          persistenceConfig,
          repairLoopSummary,
        );
        this.opts.runner.clearPersistedRepairLoopSummary(executionId);

        await this.opts.eventBus.emit("execution_end", executionId, {
          workflowName: name,
          status: "aborted",
        });

        runState.rejectWait?.(abortError);
      },
    };

    if (runTimeoutMs !== undefined) {
      runState.timeout = setTimeout(() => {
        void handle.cancel(`Execution timed out after ${runTimeoutMs}ms`);
      }, runTimeoutMs);
    }

    if (signal) {
      if (signal.aborted) {
        void handle.cancel(
          typeof signal.reason === "string" ? signal.reason : undefined,
        );
      } else {
        const onAbort = () => {
          void handle.cancel(
            typeof signal.reason === "string" ? signal.reason : undefined,
          );
        };
        signal.addEventListener("abort", onAbort, { once: true });
        runState.signalAbortListener = () => signal.removeEventListener("abort", onAbort);
      }
    }

    return handle;
  }

  private resolveExecutionTimeoutMs(
    workflow: WorkflowDef,
    variables?: Record<string, unknown>,
  ): number | undefined {
    const fromOptions = variables?.executionTimeoutMs;
    if (typeof fromOptions === "number" && Number.isFinite(fromOptions) && fromOptions > 0) {
      return fromOptions;
    }

    const fromWorkflow = workflow.variables?.executionTimeoutMs;
    if (typeof fromWorkflow === "number" && Number.isFinite(fromWorkflow) && fromWorkflow > 0) {
      return fromWorkflow;
    }

    return undefined;
  }

  /**
   * Resume a failed or suspended execution from checkpoint.
   * (Moved from OboraRuntime; kept here to support auto-recovery.)
   */
  async resume(
    runId: string,
    options: { fromStep?: string; driftPolicy?: "reject" | "warn" | "ignore" } = {},
    workflows: Map<string, WorkflowDef>,
  ): Promise<{
    execution: { id: string; status: string };
    restoredSteps: string[];
    rerunSteps: string[];
    driftDetected: boolean;
  }> {
    const adapter = await this.opts.persistenceManager.getStorageAdapter();
    const mgr = new CheckpointManager(adapter);
    const run = await adapter.getRun(runId);
    if (!run) {
      throw OboraError.executionNotFound(runId);
    }

    const checkpoint = await mgr.getLatestCheckpoint(runId);
    if (!checkpoint) {
      throw OboraError.checkpointNotFound(runId);
    }

    if (run.status !== "failed" && run.status !== "suspended") {
      throw OboraError.resumeInvalidStatus(runId, run.status);
    }

    const currentPolicyConfig = (this.opts.policy ?? {}) as PolicyHashInput;
    const drift = mgr.detectDrift(checkpoint, currentPolicyConfig);
    const driftPolicy = options.driftPolicy ?? "warn";
    if (drift.drifted && driftPolicy === "reject") {
      throw OboraError.policyDrift(drift.oldHash, drift.newHash);
    }

    const workflow = workflows.get(run.workflowName);
    const savedSteps = await adapter.getSteps(runId);

    const allStepNames = workflow
      ? workflow.steps.map((s) => s.name)
      : Array.from(new Set(savedSteps.map((s) => s.stepName)));

    if (options.fromStep && !allStepNames.includes(options.fromStep)) {
      throw OboraError.stepNotFound(options.fromStep);
    }

    const stepPolicies = mgr.resolveStepPolicies(
      savedSteps,
      checkpoint.completedSteps,
      allStepNames,
      options,
    );

    const restoredSteps = stepPolicies
      .filter((p: { action: string }) => p.action === "restore")
      .map((p: { stepName: string }) => p.stepName);
    const rerunSteps = stepPolicies
      .filter((p: { action: string }) => p.action === "rerun")
      .map((p: { stepName: string }) => p.stepName);

    if (!workflow && rerunSteps.length > 0) {
      throw OboraError.workflowNotFound(run.workflowName);
    }

    if (rerunSteps.length === 0) {
      await adapter.saveRun({
        ...run,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      return {
        execution: { id: runId, status: "completed" },
        restoredSteps,
        rerunSteps,
        driftDetected: drift.drifted,
      };
    }

    await adapter.saveRun({ ...run, status: "running", completedAt: undefined });

    if (workflow) {
      const execution = await this.opts.runner.executeResume(
        runId,
        run.workflowName,
        workflow,
        run.input,
        rerunSteps,
        stepPolicies,
        currentPolicyConfig,
        adapter,
      );

      this.opts.executions.set(runId, structuredClone(execution));
    }

    return {
      execution: { id: runId, status: "completed" },
      restoredSteps,
      rerunSteps,
      driftDetected: drift.drifted,
    };
  }
}
