import type { LLMConfig } from "../runtime-types.js";
import type { LLMAdapterLike } from "../step-executor.js";
import { CostTracker } from "../cost-tracker.js";
import type { WorkflowDef, WorkflowStep } from "../workflow.js";
import type { StorageAdapter } from "@obora/runtime";
import type {
  AgentFactory,
  OboraRuntimeConfig,
  PersistedRepairLoopSummary,
  RuntimeExecution,
} from "../runtime-types.js";
import type { EventBus } from "../events/event-bus.js";
import type { PersistenceManager } from "../persistence/persistence-manager.js";
import { BlackboardManager } from "../blackboard/blackboard-manager.js";
import { ExecutionObserver } from "../blackboard/execution-observer.js";
import type { FailureEntry } from "../blackboard/blackboard-manager.js";
import { loadAgentsFromYamlFile } from "../agents/source-loaders.js";
import { TKGService } from "./tkg-service.js";
import { TKGPromotionEngine } from "./tkg-promotion-engine.js";
import { RepairLoopTracker } from "./repair-loop-tracker.js";
import { EngineBuilder } from "./engine-builder.js";
import { StepExecutionEngine } from "./step-execution-engine.js";
import { ExecutionOrchestrator } from "./execution-orchestrator.js";
import type { ExecutionEngine } from "./engine-builder.js";
import type { OboraConfig } from "../config-loader.js";
import type { RunOptions } from "../runtime-types.js";
import type { PolicyHashInput } from "@obora/runtime";

/** Duck-type for reflector: both ExecutionReflector and ReflectorEngine implement this. */
type ReflectorLike = {
  analyzeFailures(
    failures: FailureEntry[],
    currentStepName?: string
  ): string | undefined;
};

const DEFAULT_MAX_CONCURRENCY = 3;

export interface WorkflowRunnerDeps {
  config: OboraRuntimeConfig;
  eventBus: EventBus;
  /** Factory bound to OboraRuntime.createLLMAdapter so spies still work. */
  adapterFactory: (cfg: LLMConfig) => Promise<LLMAdapterLike>;
  persistenceManager: PersistenceManager;
  agents: Map<string, AgentFactory>;
}

/**
 * WorkflowRunner owns the execution engine shared by `run()` and `resume()`.
 *
 * Responsibilities:
 *  - Config loading + LLM adapter resolution (via AdapterResolver)
 *  - Agent YAML loading
 *  - StepExecutor construction with per-agent LLM resolution
 *  - Step execution loop (back-edge / on_fail support)
 *  - Persistence save-points
 *  - Knowledge context injection
 */
export class WorkflowRunner {
  private readonly repairLoopTracker = new RepairLoopTracker();
  private readonly tkgService: TKGService;
  private readonly tkgPromotionEngine: TKGPromotionEngine;
  private readonly engineBuilder: EngineBuilder;
  private readonly stepExecutionEngine: StepExecutionEngine;
  private readonly orchestrator: ExecutionOrchestrator;

  constructor(private readonly deps: WorkflowRunnerDeps) {
    this.tkgService = new TKGService(deps);
    this.tkgPromotionEngine = new TKGPromotionEngine({ eventBus: deps.eventBus });
    this.engineBuilder = new EngineBuilder(deps);
    this.stepExecutionEngine = new StepExecutionEngine({
      eventBus: deps.eventBus,
      config: deps.config,
      repairLoopTracker: this.repairLoopTracker,
    });
    this.orchestrator = new ExecutionOrchestrator({
      deps,
      tkgService: this.tkgService,
      tkgPromotionEngine: this.tkgPromotionEngine,
      stepExecutionEngine: this.stepExecutionEngine,
      engineBuilder: this.engineBuilder,
      repairLoopTracker: this.repairLoopTracker,
    });
  }

  // ── Agent YAML loader ────────────────────────────────────────────────────

  async loadAgentsFromYaml(path?: string): Promise<Map<string, AgentFactory>> {
    return loadAgentsFromYamlFile(path);
  }

  // ── Shared engine builder ────────────────────────────────────────────────

  /**
   * Loads config, resolves LLM credentials, builds AdapterResolver + StepExecutor.
   * Called by both run() and resume() to eliminate duplicated setup.
   */
  async buildEngine(
    executionId: string,
    persistenceEnabled: boolean,
    persistenceConfig: OboraConfig["persistence"] | undefined,
    workflow?: WorkflowDef
  ): Promise<ExecutionEngine> {
    return this.engineBuilder.build(
      executionId,
      persistenceEnabled,
      persistenceConfig,
      workflow
    );
  }

  getPersistedRepairLoopSummary(
    executionId: string
  ): PersistedRepairLoopSummary | undefined {
    return this.orchestrator.getPersistedRepairLoopSummary(executionId);
  }

  clearPersistedRepairLoopSummary(executionId: string): void {
    this.orchestrator.clearPersistedRepairLoopSummary(executionId);
  }

  // ── Core step-execution loop ─────────────────────────────────────────────

  /**
   * Executes a sorted list of steps, handling back-edges (on_fail.goto),
   * persistence save-points, and event emission.
   *
   * Returns when all steps complete successfully.
   * Throws on step failure that exhausts back-edge retries.
   */
  async executeStepLoop(
    sortedSteps: WorkflowStep[],
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    costTracker: CostTracker | undefined,
    executionId: string,
    persistenceEnabled: boolean,
    persistenceAdapter: StorageAdapter | null,
    signal?: AbortSignal,
    isSettledFn?: () => boolean,
    blackboard?: BlackboardManager,
    reflector?: ReflectorLike,
    observer?: ExecutionObserver
  ): Promise<void> {
    return this.stepExecutionEngine.executeStepLoop(
      sortedSteps,
      workflow,
      execution,
      stepExecutor,
      costTracker,
      executionId,
      persistenceEnabled,
      persistenceAdapter,
      signal,
      isSettledFn,
      blackboard,
      reflector,
      observer
    );
  }

  async executeParallelStepLoop(
    layers: WorkflowStep[][],
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    costTracker: CostTracker | undefined,
    executionId: string,
    persistenceEnabled: boolean,
    persistenceAdapter: StorageAdapter | null,
    signal?: AbortSignal,
    isSettledFn?: () => boolean,
    blackboard?: BlackboardManager,
    reflector?: ReflectorLike,
    observer?: ExecutionObserver,
    maxConcurrency: number = DEFAULT_MAX_CONCURRENCY
  ): Promise<void> {
    return this.stepExecutionEngine.executeParallelStepLoop(
      layers,
      workflow,
      execution,
      stepExecutor,
      costTracker,
      executionId,
      persistenceEnabled,
      persistenceAdapter,
      signal,
      isSettledFn,
      blackboard,
      reflector,
      observer,
      maxConcurrency
    );
  }

  // ── Run execution ────────────────────────────────────────────────────────

  /**
   * Runs a workflow definition and returns the completed RuntimeExecution.
   * Called from OboraRuntime.run() after handle/promise scaffolding is set up.
   */
  async executeRun(
    executionId: string,
    workflowName: string,
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    options: RunOptions,
    isSettledFn: () => boolean
  ): Promise<void> {
    return this.orchestrator.executeRun(
      executionId,
      workflowName,
      workflow,
      execution,
      options,
      isSettledFn
    );
  }

  // ── Resume execution ─────────────────────────────────────────────────────

  /**
   * Re-executes only the `rerunSteps` of a previously failed/suspended run.
   * Restores completed step outputs from `stepPolicies` before re-running.
   */
  async executeResume(
    runId: string,
    workflowName: string,
    workflow: WorkflowDef,
    runInput: unknown,
    rerunSteps: string[],
    stepPolicies: Array<{ stepName: string; action: string; output?: unknown }>,
    currentPolicyConfig: PolicyHashInput,
    adapter: StorageAdapter
  ): Promise<RuntimeExecution> {
    return this.orchestrator.executeResume(
      runId,
      workflowName,
      workflow,
      runInput,
      rerunSteps,
      stepPolicies,
      currentPolicyConfig,
      adapter
    );
  }
}
